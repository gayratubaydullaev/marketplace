package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strconv"
	"strings"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/config"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/packages/go-common/otelx"
	"github.com/gayrat/marketplace/services/reviews/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

func main() {
	cfg := config.Load("reviews-service")
	if err := cfg.ValidateSecrets(); err != nil {
		log.Fatal(err)
	}
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8008"
	}
	database, _ := db.Connect(cfg.DatabaseURL)
	producer := kafkax.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()
	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)

	shutdown, _ := otelx.Init(cfg.ServiceName)
	defer func() { _ = shutdown(context.Background()) }()
	r := gin.New()
	r.Use(gin.Recovery(), otelx.Middleware(cfg.ServiceName), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	v1 := r.Group("/v1")
	{
		v1.GET("/products/:id/reviews", listProductReviews(database))
		v1.GET("/products/:id/review-eligibility", middleware.JWT(tokenMgr, false), reviewEligibility(database))
		v1.POST("/products/:id/reviews", middleware.JWT(tokenMgr, false), createReview(database, producer))
		v1.POST("/reviews/:id/helpful", middleware.JWT(tokenMgr, false), markHelpful(database))
		v1.POST("/reviews/:id/reply", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin), replyReview(database))
		v1.POST("/admin/reviews/:id/moderate", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleModerator, commonauth.RoleTenantAdmin), moderateReview(database))
		v1.GET("/admin/reviews", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleModerator, commonauth.RoleTenantAdmin), adminListReviews(database))
	}

	log.Printf("reviews-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}

func listProductReviews(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID := middleware.GetTenantID(c)
		productID := c.Param("id")
		limit := clampInt(queryInt(c, "limit", 50), 1, 100)
		offset := clampInt(queryInt(c, "offset", 0), 0, 10_000)
		sort := c.DefaultQuery("sort", "newest")
		orderBy := "r.created_at DESC"
		switch sort {
		case "helpful":
			orderBy = "r.helpful_count DESC, r.created_at DESC"
		case "rating_high":
			orderBy = "r.rating DESC, r.created_at DESC"
		case "rating_low":
			orderBy = "r.rating ASC, r.created_at DESC"
		}

		var total int
		_ = database.Get(&total, `SELECT COUNT(*) FROM reviews WHERE tenant_id=$1 AND product_id=$2 AND status='approved'`, tenantID, productID)

		rows, err := database.Queryx(`
			SELECT r.id, r.rating, r.title, r.body, r.media, r.vendor_reply, r.helpful_count,
			       r.verified_purchase, r.created_at,
			       r.score_delivery, r.score_quality, r.score_communication,
			       NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), '') AS author_name
			FROM reviews r
			LEFT JOIN users u ON u.id = r.user_id
			WHERE r.tenant_id=$1 AND r.product_id=$2 AND r.status='approved'
			ORDER BY `+orderBy+`
			LIMIT $3 OFFSET $4`, tenantID, productID, limit, offset)
		if err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		defer rows.Close()
		items := scanMaps(rows)

		var dist []struct {
			Rating int `db:"rating"`
			Cnt    int `db:"cnt"`
		}
		_ = database.Select(&dist, `
			SELECT rating, COUNT(*)::int AS cnt
			FROM reviews
			WHERE tenant_id=$1 AND product_id=$2 AND status='approved'
			GROUP BY rating`, tenantID, productID)
		histogram := map[string]int{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
		var sum float64
		for _, d := range dist {
			histogram[strconv.Itoa(d.Rating)] = d.Cnt
			sum += float64(d.Rating * d.Cnt)
		}
		avg := 0.0
		if total > 0 {
			avg = sum / float64(total)
		}

		httpx.OK(c, gin.H{
			"items":     items,
			"total":     total,
			"limit":     limit,
			"offset":    offset,
			"average":   float64(int(avg*10+0.5)) / 10,
			"histogram": histogram,
		})
	}
}

func reviewEligibility(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := middleware.GetClaims(c)
		tenantID := middleware.GetTenantID(c)
		productID := c.Param("id")

		var existing string
		_ = database.Get(&existing, `SELECT id::text FROM reviews WHERE tenant_id=$1 AND user_id=$2 AND product_id=$3 LIMIT 1`, tenantID, claims.UserID, productID)
		if existing != "" {
			httpx.OK(c, gin.H{"can_review": false, "already_reviewed": true, "review_id": existing})
			return
		}

		orderID, vendorID, ok := findEligiblePurchase(database, claims.UserID, productID)
		if !ok {
			httpx.OK(c, gin.H{"can_review": false, "already_reviewed": false, "reason": "no_verified_purchase"})
			return
		}
		httpx.OK(c, gin.H{
			"can_review":        true,
			"already_reviewed":  false,
			"order_id":          orderID,
			"vendor_id":         vendorID,
			"verified_purchase": true,
		})
	}
}

func createReview(database *sqlx.DB, producer *kafkax.Producer) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			OrderID            string   `json:"order_id"`
			Rating             int      `json:"rating" binding:"required,min=1,max=5"`
			Title              string   `json:"title"`
			Body               string   `json:"body"`
			VendorID           *string  `json:"vendor_id"`
			Media              []string `json:"media"`
			ScoreDelivery      *int     `json:"score_delivery"`
			ScoreQuality       *int     `json:"score_quality"`
			ScoreCommunication *int     `json:"score_communication"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, err.Error())
			return
		}
		body.Title = strings.TrimSpace(body.Title)
		body.Body = strings.TrimSpace(body.Body)
		if body.Body == "" {
			httpx.BadRequest(c, "body is required")
			return
		}
		if len(body.Title) > 200 {
			httpx.BadRequest(c, "title too long")
			return
		}
		if len(body.Body) > 5000 {
			httpx.BadRequest(c, "body too long")
			return
		}
		if len(body.Media) > 6 {
			httpx.BadRequest(c, "max 6 media items")
			return
		}
		media := make([]string, 0, len(body.Media))
		for _, u := range body.Media {
			u = strings.TrimSpace(u)
			if u == "" {
				continue
			}
			if !(strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "/")) {
				httpx.BadRequest(c, "invalid media url")
				return
			}
			media = append(media, u)
		}
		for _, s := range []*int{body.ScoreDelivery, body.ScoreQuality, body.ScoreCommunication} {
			if s != nil && (*s < 1 || *s > 5) {
				httpx.BadRequest(c, "axis scores must be 1-5")
				return
			}
		}

		claims := middleware.GetClaims(c)
		tenantID := middleware.GetTenantID(c)
		productID := c.Param("id")

		var existing int
		_ = database.Get(&existing, `SELECT COUNT(1) FROM reviews WHERE tenant_id=$1 AND user_id=$2 AND product_id=$3`, tenantID, claims.UserID, productID)
		if existing > 0 {
			httpx.BadRequest(c, "you already reviewed this product")
			return
		}

		orderID := body.OrderID
		vendorID := body.VendorID
		verified := false

		if orderID != "" {
			var cnt int
			_ = database.Get(&cnt, `
				SELECT COUNT(1)
				FROM order_items oi
				JOIN orders o ON o.id = oi.order_id
				WHERE o.id=$1 AND o.user_id=$2 AND oi.product_id=$3
				  AND o.payment_status='paid'
				  AND o.status IN ('delivered','completed')`, orderID, claims.UserID, productID)
			verified = cnt > 0
		}

		if !verified {
			autoOrder, autoVendor, ok := findEligiblePurchase(database, claims.UserID, productID)
			if !ok {
				httpx.Forbidden(c, "only verified purchasers can review")
				return
			}
			orderID = autoOrder
			verified = true
			if vendorID == nil && autoVendor != "" {
				vendorID = &autoVendor
			}
		}

		if vendorID == nil || *vendorID == "" {
			var vid string
			_ = database.Get(&vid, `SELECT vendor_id::text FROM products WHERE id=$1`, productID)
			if vid != "" {
				vendorID = &vid
			}
		}

		status := service.Status(body.Title + " " + body.Body)
		id := uuid.NewString()
		mediaJSON := "[]"
		if len(media) > 0 {
			b, _ := json.Marshal(media)
			mediaJSON = string(b)
		}
		_, err := database.Exec(`
			INSERT INTO reviews (
				id, tenant_id, product_id, vendor_id, user_id, order_id, rating, title, body, media,
				status, verified_purchase, score_delivery, score_quality, score_communication
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,true,$12,$13,$14)`,
			id, tenantID, productID, vendorID, claims.UserID, orderID, body.Rating, body.Title, body.Body, mediaJSON,
			status, body.ScoreDelivery, body.ScoreQuality, body.ScoreCommunication)
		if err != nil {
			if strings.Contains(err.Error(), "idx_reviews_unique_user_product") || strings.Contains(err.Error(), "duplicate key") {
				httpx.BadRequest(c, "you already reviewed this product")
				return
			}
			httpx.BadRequest(c, err.Error())
			return
		}

		if status == "approved" {
			refreshProductRating(database, productID)
			refreshVendorRating(database, vendorID)
		}

		event := gin.H{
			"review_id":  id,
			"product_id": productID,
			"user_id":    claims.UserID,
			"tenant_id":  tenantID,
			"rating":     body.Rating,
			"status":     status,
		}
		if vendorID != nil {
			event["vendor_id"] = *vendorID
			// Notify vendor owner about new review.
			var vendorOwner string
			_ = database.Get(&vendorOwner, `SELECT user_id::text FROM vendors WHERE id=$1`, *vendorID)
			if vendorOwner != "" {
				event["notify_user_id"] = vendorOwner
				_ = producer.Publish(c.Request.Context(), kafkax.TopicReviewSubmitted, id, gin.H{
					"review_id":  id,
					"product_id": productID,
					"user_id":    vendorOwner,
					"tenant_id":  tenantID,
					"rating":     body.Rating,
					"status":     status,
					"vendor_id":  *vendorID,
					"author_id":  claims.UserID,
				})
			} else {
				_ = producer.Publish(c.Request.Context(), kafkax.TopicReviewSubmitted, id, event)
			}
		} else {
			_ = producer.Publish(c.Request.Context(), kafkax.TopicReviewSubmitted, id, event)
		}

		httpx.Created(c, gin.H{"id": id, "status": status, "verified_purchase": true})
	}
}

func markHelpful(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := middleware.GetClaims(c)
		tenantID := middleware.GetTenantID(c)
		reviewID := c.Param("id")

		var authorID string
		err := database.Get(&authorID, `SELECT user_id::text FROM reviews WHERE id=$1 AND tenant_id=$2 AND status='approved'`, reviewID, tenantID)
		if err != nil {
			httpx.NotFound(c, "review not found")
			return
		}
		if authorID == claims.UserID {
			httpx.BadRequest(c, "cannot mark your own review helpful")
			return
		}

		res, err := database.Exec(`INSERT INTO review_helpful_votes (review_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, reviewID, claims.UserID)
		if err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			httpx.OK(c, gin.H{"ok": true, "already_voted": true})
			return
		}
		_, _ = database.Exec(`UPDATE reviews SET helpful_count = helpful_count + 1, updated_at = NOW() WHERE id=$1`, reviewID)
		var count int
		_ = database.Get(&count, `SELECT helpful_count FROM reviews WHERE id=$1`, reviewID)
		httpx.OK(c, gin.H{"ok": true, "helpful_count": count})
	}
}

func replyReview(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Reply string `json:"reply" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, err.Error())
			return
		}
		body.Reply = strings.TrimSpace(body.Reply)
		if body.Reply == "" {
			httpx.BadRequest(c, "reply is required")
			return
		}
		if len(body.Reply) > 2000 {
			httpx.BadRequest(c, "reply too long")
			return
		}

		claims := middleware.GetClaims(c)
		tenantID := middleware.GetTenantID(c)
		var vendorID *string
		if err := database.Get(&vendorID, `SELECT vendor_id::text FROM reviews WHERE id=$1 AND tenant_id=$2`, c.Param("id"), tenantID); err != nil {
			httpx.NotFound(c, "review not found")
			return
		}
		if claims.Role == commonauth.RoleVendor {
			if claims.VendorID == "" || vendorID == nil || *vendorID != claims.VendorID {
				httpx.Forbidden(c, "not your review")
				return
			}
		}
		res, err := database.Exec(`UPDATE reviews SET vendor_reply=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, body.Reply, c.Param("id"), tenantID)
		if err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			httpx.NotFound(c, "review not found")
			return
		}
		httpx.OK(c, gin.H{"ok": true})
	}
}

func moderateReview(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Status string `json:"status" binding:"required"`
			Reason string `json:"reason"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, err.Error())
			return
		}
		body.Status = strings.ToLower(strings.TrimSpace(body.Status))
		if body.Status != "approved" && body.Status != "rejected" && body.Status != "pending" {
			httpx.BadRequest(c, "status must be approved, rejected, or pending")
			return
		}

		tenantID := middleware.GetTenantID(c)
		var row struct {
			ProductID string  `db:"product_id"`
			VendorID  *string `db:"vendor_id"`
		}
		err := database.Get(&row, `SELECT product_id::text AS product_id, vendor_id::text AS vendor_id FROM reviews WHERE id=$1 AND tenant_id=$2`, c.Param("id"), tenantID)
		if err != nil {
			httpx.NotFound(c, "review not found")
			return
		}

		reason := strings.TrimSpace(body.Reason)
		res, err := database.Exec(`UPDATE reviews SET status=$1, moderation_reason=NULLIF($2,''), updated_at=NOW() WHERE id=$3 AND tenant_id=$4`, body.Status, reason, c.Param("id"), tenantID)
		if err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			httpx.NotFound(c, "review not found")
			return
		}

		refreshProductRating(database, row.ProductID)
		refreshVendorRating(database, row.VendorID)
		httpx.OK(c, gin.H{"status": body.Status})
	}
}

func adminListReviews(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := c.DefaultQuery("status", "pending")
		limit := clampInt(queryInt(c, "limit", 100), 1, 200)
		offset := clampInt(queryInt(c, "offset", 0), 0, 10_000)
		q := `
			SELECT r.id, r.tenant_id, r.product_id, r.vendor_id, r.user_id, r.rating, r.title, r.body,
			       r.vendor_reply, r.status, r.verified_purchase, r.moderation_reason, r.created_at,
			       NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), '') AS author_name
			FROM reviews r
			LEFT JOIN users u ON u.id = r.user_id
			WHERE r.tenant_id=$1`
		args := []any{middleware.GetTenantID(c)}
		if status != "all" {
			q += ` AND r.status=$2`
			args = append(args, status)
		}
		q += ` ORDER BY r.created_at DESC LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)
		args = append(args, limit, offset)

		rows, err := database.Queryx(q, args...)
		if err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		defer rows.Close()
		httpx.OK(c, gin.H{"items": scanMaps(rows), "status": status, "limit": limit, "offset": offset})
	}
}

func findEligiblePurchase(database *sqlx.DB, userID, productID string) (orderID, vendorID string, ok bool) {
	type row struct {
		OrderID  string  `db:"order_id"`
		VendorID *string `db:"vendor_id"`
	}
	var r row
	err := database.Get(&r, `
		SELECT o.id::text AS order_id, COALESCE(oi.vendor_id::text, p.vendor_id::text) AS vendor_id
		FROM orders o
		JOIN order_items oi ON oi.order_id = o.id
		LEFT JOIN products p ON p.id = oi.product_id
		WHERE o.user_id=$1 AND oi.product_id=$2
		  AND o.payment_status='paid'
		  AND o.status IN ('delivered','completed')
		ORDER BY o.created_at DESC
		LIMIT 1`, userID, productID)
	if err != nil {
		return "", "", false
	}
	vid := ""
	if r.VendorID != nil {
		vid = *r.VendorID
	}
	return r.OrderID, vid, true
}

func refreshProductRating(db *sqlx.DB, productID string) {
	if productID == "" {
		return
	}
	_, _ = db.Exec(`
		UPDATE products SET
			rating = COALESCE((SELECT AVG(rating)::numeric(2,1) FROM reviews WHERE product_id=$1 AND status='approved'), 0),
			review_count = (SELECT COUNT(*) FROM reviews WHERE product_id=$1 AND status='approved'),
			updated_at = NOW()
		WHERE id=$1`, productID)
}

func refreshVendorRating(db *sqlx.DB, vendorID *string) {
	if vendorID == nil || *vendorID == "" {
		return
	}
	_, _ = db.Exec(`
		UPDATE vendors SET
			rating = COALESCE((SELECT AVG(rating)::numeric(2,1) FROM reviews WHERE vendor_id=$1 AND status='approved'), 0),
			review_count = (SELECT COUNT(*) FROM reviews WHERE vendor_id=$1 AND status='approved'),
			rating_delivery = COALESCE((SELECT AVG(score_delivery)::numeric(2,1) FROM reviews WHERE vendor_id=$1 AND status='approved' AND score_delivery IS NOT NULL), 0),
			rating_quality = COALESCE((SELECT AVG(score_quality)::numeric(2,1) FROM reviews WHERE vendor_id=$1 AND status='approved' AND score_quality IS NOT NULL), 0),
			rating_communication = COALESCE((SELECT AVG(score_communication)::numeric(2,1) FROM reviews WHERE vendor_id=$1 AND status='approved' AND score_communication IS NOT NULL), 0),
			updated_at = NOW()
		WHERE id=$1`, *vendorID)
}

func scanMaps(rows *sqlx.Rows) []map[string]any {
	var items []map[string]any
	for rows.Next() {
		m := map[string]any{}
		_ = rows.MapScan(m)
		items = append(items, m)
	}
	if items == nil {
		items = []map[string]any{}
	}
	return items
}

func queryInt(c *gin.Context, key string, def int) int {
	v := c.Query(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
