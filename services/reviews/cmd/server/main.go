package main

import (
	"log"
	"os"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/config"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func main() {
	cfg := config.Load("reviews-service")
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8008"
	}
	database, _ := db.Connect(cfg.DatabaseURL)
	producer := kafkax.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()
	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	v1 := r.Group("/v1")
	{
		v1.GET("/products/:id/reviews", func(c *gin.Context) {
			rows, err := database.Queryx(`SELECT id, rating, title, body, media, vendor_reply, helpful_count, verified_purchase, created_at FROM reviews WHERE product_id=$1 AND status='approved' ORDER BY created_at DESC`, c.Param("id"))
			if err != nil {
				httpx.Internal(c, err.Error())
				return
			}
			defer rows.Close()
			var items []map[string]any
			for rows.Next() {
				m := map[string]any{}
				_ = rows.MapScan(m)
				items = append(items, m)
			}
			httpx.OK(c, gin.H{"items": items})
		})
		v1.POST("/products/:id/reviews", middleware.JWT(tokenMgr, false), func(c *gin.Context) {
			var body struct {
				OrderID string `json:"order_id"`
				Rating  int    `json:"rating" binding:"required,min=1,max=5"`
				Title   string `json:"title"`
				Body    string `json:"body"`
				VendorID *string `json:"vendor_id"`
			}
			if err := c.ShouldBindJSON(&body); err != nil {
				httpx.BadRequest(c, err.Error())
				return
			}
			claims := middleware.GetClaims(c)
			verified := false
			if body.OrderID != "" {
				var cnt int
				_ = database.Get(&cnt, `SELECT COUNT(1) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.id=$1 AND o.user_id=$2 AND oi.product_id=$3`, body.OrderID, claims.UserID, c.Param("id"))
				verified = cnt > 0
			}
			if !verified {
				httpx.Forbidden(c, "only verified purchasers can review")
				return
			}
			// simple toxicity filter
			status := "approved"
			lower := body.Body
			for _, bad := range []string{"spam", "scam", "http://"} {
				if containsFold(lower, bad) {
					status = "pending"
				}
			}
			id := uuid.NewString()
			_, err := database.Exec(`INSERT INTO reviews (id, tenant_id, product_id, vendor_id, user_id, order_id, rating, title, body, status, verified_purchase)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
				id, middleware.GetTenantID(c), c.Param("id"), body.VendorID, claims.UserID, body.OrderID, body.Rating, body.Title, body.Body, status)
			if err != nil {
				httpx.BadRequest(c, err.Error())
				return
			}
			if body.VendorID != nil {
				_, _ = database.Exec(`UPDATE vendors SET rating=(SELECT AVG(rating)::numeric(2,1) FROM reviews WHERE vendor_id=$1 AND status='approved'),
					review_count=(SELECT COUNT(*) FROM reviews WHERE vendor_id=$1 AND status='approved') WHERE id=$1`, *body.VendorID)
			}
			_ = producer.Publish(c.Request.Context(), "review.submitted", id, gin.H{"review_id": id, "product_id": c.Param("id")})
			httpx.Created(c, gin.H{"id": id, "status": status})
		})
		v1.POST("/reviews/:id/helpful", middleware.JWT(tokenMgr, false), func(c *gin.Context) {
			_, _ = database.Exec(`UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id=$1`, c.Param("id"))
			httpx.OK(c, gin.H{"ok": true})
		})
		v1.POST("/reviews/:id/reply", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin), func(c *gin.Context) {
			var body struct {
				Reply string `json:"reply" binding:"required"`
			}
			if err := c.ShouldBindJSON(&body); err != nil {
				httpx.BadRequest(c, err.Error())
				return
			}
			_, _ = database.Exec(`UPDATE reviews SET vendor_reply=$1 WHERE id=$2`, body.Reply, c.Param("id"))
			httpx.OK(c, gin.H{"ok": true})
		})
		v1.POST("/admin/reviews/:id/moderate", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleModerator, commonauth.RoleTenantAdmin), func(c *gin.Context) {
			var body struct {
				Status string `json:"status" binding:"required"`
			}
			_ = c.ShouldBindJSON(&body)
			_, _ = database.Exec(`UPDATE reviews SET status=$1 WHERE id=$2`, body.Status, c.Param("id"))
			httpx.OK(c, gin.H{"status": body.Status})
		})
		v1.GET("/admin/reviews", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleModerator, commonauth.RoleTenantAdmin), func(c *gin.Context) {
			status := c.DefaultQuery("status", "pending")
			q := `SELECT id, tenant_id, product_id, vendor_id, user_id, rating, title, body, vendor_reply, status, verified_purchase, created_at FROM reviews WHERE tenant_id=$1`
			args := []any{middleware.GetTenantID(c)}
			if status != "all" {
				q += ` AND status=$2`
				args = append(args, status)
			}
			q += ` ORDER BY created_at DESC LIMIT 100`
			rows, err := database.Queryx(q, args...)
			if err != nil {
				httpx.Internal(c, err.Error())
				return
			}
			defer rows.Close()
			var items []map[string]any
			for rows.Next() {
				m := map[string]any{}
				_ = rows.MapScan(m)
				items = append(items, m)
			}
			httpx.OK(c, gin.H{"items": items, "status": status})
		})
	}

	log.Printf("reviews-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}

func containsFold(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && (stringContains(s, substr))))
}

func stringContains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
