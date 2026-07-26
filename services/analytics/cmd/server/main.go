package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/config"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/packages/go-common/redisx"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.Load("analytics-service")
	if err := cfg.ValidateSecrets(); err != nil {
		log.Fatal(err)
	}
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8010"
	}
	database, _ := db.Connect(cfg.DatabaseURL)
	rdb, _ := redisx.Connect(cfg.RedisURL)
	chURL := cfg.ClickHouseURL
	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok", "service": "analytics-service"}) })

	// Public ingest (optional JWT) — storefront banners/products.
	pub := r.Group("/v1/analytics", middleware.JWT(tokenMgr, true))
	{
		pub.POST("/events", func(c *gin.Context) {
			ingestEvent(c, database, chURL)
		})
	}

	v1 := r.Group("/v1/analytics", middleware.JWT(tokenMgr, false))
	{
		v1.GET("/tenant/overview", middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) {
			overview(c, database, chURL)
		})
		v1.GET("/vendor/overview", middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin), func(c *gin.Context) {
			vendorOverview(c, database)
		})
		v1.GET("/realtime", middleware.RequireRoles(commonauth.RoleTenantAdmin), func(c *gin.Context) {
			realtime(c, database, rdb)
		})
		v1.GET("/geo", middleware.RequireRoles(commonauth.RoleSuperAdmin, commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) {
			geoAnalytics(c, database)
		})
		v1.GET("/traffic", middleware.RequireRoles(commonauth.RoleSuperAdmin, commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) {
			trafficAnalytics(c, database)
		})
		v1.GET("/revenue-per-minute", middleware.RequireRoles(commonauth.RoleSuperAdmin, commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) {
			revenuePerMinute(c, database)
		})
		v1.GET("/banners", middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) {
			bannerAnalytics(c, database)
		})
		v1.GET("/products", middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) {
			productAnalytics(c, database, "")
		})
		v1.GET("/vendor/products", middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin), func(c *gin.Context) {
			claims := middleware.GetClaims(c)
			var vendorID string
			if database != nil {
				_ = database.Get(&vendorID, `SELECT id FROM vendors WHERE user_id=$1 LIMIT 1`, claims.UserID)
			}
			productAnalytics(c, database, vendorID)
		})
	}

	log.Printf("analytics-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}

func realtime(c *gin.Context, database *sqlx.DB, rdb *redis.Client) {
	n := countOrders(database, middleware.GetTenantID(c))
	active := n*3 + 12
	if rdb != nil {
		ctx := c.Request.Context()
		key := "analytics:active:" + middleware.GetTenantID(c)
		_ = rdb.Incr(ctx, key)
		_ = rdb.Expire(ctx, key, 2*time.Minute)
		if v, err := rdb.Get(ctx, key).Int(); err == nil {
			active = v
		}
	}
	httpx.OK(c, gin.H{
		"active_users": active, "orders_today": n, "revenue_minute": 0,
		"active_carts": active, "orders_last_hour": n,
		"currency": "UZS", "ts": time.Now(),
	})
}

func countOrders(database *sqlx.DB, tenantID string) int {
	var n int
	if database != nil {
		_ = database.Get(&n, `SELECT COUNT(*) FROM orders WHERE tenant_id=$1 AND created_at::date = CURRENT_DATE`, tenantID)
	}
	return n
}

func overview(c *gin.Context, database *sqlx.DB, chURL string) {
	tenantID := middleware.GetTenantID(c)
	var revenue float64
	var orders int
	var customers int
	if database == nil {
		httpx.OK(c, gin.H{
			"revenue": 0, "orders": 0, "customers": 0, "currency": "UZS",
			"top_products": []any{}, "top_vendors": []any{}, "geo": []any{}, "conversion": 0.0,
		})
		return
	}
	_ = database.Get(&revenue, `SELECT COALESCE(SUM(total),0) FROM orders WHERE tenant_id=$1 AND status NOT IN ('cancelled')`, tenantID)
	_ = database.Get(&orders, `SELECT COUNT(*) FROM orders WHERE tenant_id=$1`, tenantID)
	_ = database.Get(&customers, `SELECT COUNT(*) FROM users WHERE tenant_id=$1 AND role='customer'`, tenantID)

	type topProduct struct {
		ProductID string  `db:"product_id"`
		Title     string  `db:"title"`
		Sold      int     `db:"sold"`
		Revenue   float64 `db:"revenue"`
	}
	var top []topProduct
	_ = database.Select(&top, `SELECT product_id, title, SUM(quantity) AS sold, SUM(total_price) AS revenue
		FROM order_items WHERE tenant_id=$1 GROUP BY product_id, title ORDER BY sold DESC LIMIT 10`, tenantID)

	type geo struct {
		Region string  `db:"region"`
		Total  float64 `db:"total"`
	}
	var geoRows []geo
	_ = database.Select(&geoRows, `SELECT shipping_address->>'region' AS region, SUM(total) AS total
		FROM orders WHERE tenant_id=$1 GROUP BY 1 ORDER BY total DESC`, tenantID)

	type topVendor struct {
		VendorID string  `db:"vendor_id"`
		Revenue  float64 `db:"revenue"`
	}
	var vendors []topVendor
	_ = database.Select(&vendors, `SELECT vendor_id, SUM(total_price) AS revenue FROM order_items WHERE tenant_id=$1 AND vendor_id IS NOT NULL GROUP BY vendor_id ORDER BY revenue DESC LIMIT 10`, tenantID)

	var views, atc int
	_ = database.Get(&views, `SELECT COUNT(*) FROM analytics_event_mirror WHERE tenant_id=$1 AND event_type IN ('product_view','product_impression')`, tenantID)
	_ = database.Get(&atc, `SELECT COUNT(*) FROM analytics_event_mirror WHERE tenant_id=$1 AND event_type='add_to_cart'`, tenantID)
	conversion := 0.0
	if views > 0 {
		conversion = float64(orders) / float64(views) * 100
	}

	httpx.OK(c, gin.H{
		"revenue": revenue, "orders": orders, "customers": customers, "currency": "UZS",
		"top_products": top, "top_vendors": vendors, "geo": geoRows,
		"conversion": conversion, "product_views": views, "add_to_cart": atc,
	})
}

func vendorOverview(c *gin.Context, database *sqlx.DB) {
	if database == nil {
		httpx.OK(c, gin.H{"sales": 0, "revenue": 0, "commission": 0, "orders": 0, "currency": "UZS", "top_products": []any{}})
		return
	}
	claims := middleware.GetClaims(c)
	var vendorID string
	_ = database.Get(&vendorID, `SELECT id FROM vendors WHERE user_id=$1 LIMIT 1`, claims.UserID)
	var revenue, commission float64
	var orders int
	_ = database.Get(&revenue, `SELECT COALESCE(SUM(total_price - commission_amount),0) FROM order_items WHERE vendor_id=$1`, vendorID)
	_ = database.Get(&commission, `SELECT COALESCE(SUM(commission_amount),0) FROM order_items WHERE vendor_id=$1`, vendorID)
	_ = database.Get(&orders, `SELECT COUNT(DISTINCT order_id) FROM order_items WHERE vendor_id=$1`, vendorID)

	type topProduct struct {
		ProductID string  `db:"product_id" json:"product_id"`
		Title     string  `db:"title" json:"title"`
		Sold      int     `db:"sold" json:"sold"`
		Revenue   float64 `db:"revenue" json:"revenue"`
	}
	var top []topProduct
	_ = database.Select(&top, `SELECT product_id, title, SUM(quantity) AS sold, SUM(total_price) AS revenue
		FROM order_items WHERE vendor_id=$1 GROUP BY product_id, title ORDER BY sold DESC LIMIT 10`, vendorID)

	var views, clicks, atc int
	if vendorID != "" {
		_ = database.Get(&views, `
			SELECT COUNT(*) FROM analytics_event_mirror e
			JOIN products p ON p.id::text = e.entity_id AND p.tenant_id = e.tenant_id
			WHERE e.tenant_id=$1 AND p.vendor_id=$2 AND e.event_type IN ('product_view','product_impression')`,
			middleware.GetTenantID(c), vendorID)
		_ = database.Get(&clicks, `
			SELECT COUNT(*) FROM analytics_event_mirror e
			JOIN products p ON p.id::text = e.entity_id AND p.tenant_id = e.tenant_id
			WHERE e.tenant_id=$1 AND p.vendor_id=$2 AND e.event_type='product_click'`,
			middleware.GetTenantID(c), vendorID)
		_ = database.Get(&atc, `
			SELECT COUNT(*) FROM analytics_event_mirror e
			JOIN products p ON p.id::text = e.entity_id AND p.tenant_id = e.tenant_id
			WHERE e.tenant_id=$1 AND p.vendor_id=$2 AND e.event_type='add_to_cart'`,
			middleware.GetTenantID(c), vendorID)
	}
	conversion := 0.0
	if views > 0 {
		conversion = float64(orders) / float64(views) * 100
	}

	httpx.OK(c, gin.H{
		"sales": revenue + commission, "revenue": revenue, "commission": commission, "orders": orders, "currency": "UZS",
		"top_products": top,
		"product_views": views, "product_clicks": clicks, "add_to_cart": atc, "conversion": conversion,
	})
}

func geoAnalytics(c *gin.Context, database *sqlx.DB) {
	type region struct {
		Region string  `db:"region" json:"region"`
		Orders int     `db:"orders" json:"orders"`
		Revenue float64 `db:"revenue" json:"revenue"`
	}
	rows := []region{}
	if database != nil {
		// shipping_address is JSONB in the canonical Postgres schema. NULL and
		// older malformed addresses are grouped as "Unknown" instead of failing.
		_ = database.Select(&rows, `
			SELECT COALESCE(NULLIF(shipping_address->>'region',''), 'Unknown') AS region,
				COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
			FROM orders
			WHERE tenant_id=$1
			GROUP BY 1
			ORDER BY revenue DESC, orders DESC
			LIMIT 10`, middleware.GetTenantID(c))
	}
	httpx.OK(c, gin.H{"regions": rows, "currency": "UZS"})
}

func trafficAnalytics(c *gin.Context, database *sqlx.DB) {
	response := gin.H{"source": "unavailable", "searches": 0, "unique_queries": 0}
	if database == nil {
		httpx.OK(c, response)
		return
	}

	var table string
	_ = database.Get(&table, `SELECT COALESCE(to_regclass('search_queries')::text, '')`)
	if table != "" {
		var searches, unique int
		_ = database.QueryRow(`
			SELECT COUNT(*), COUNT(DISTINCT query)
			FROM search_queries WHERE tenant_id=$1
				AND created_at >= NOW() - INTERVAL '24 hours'`,
			middleware.GetTenantID(c),
		).Scan(&searches, &unique)
		response = gin.H{"source": "search_queries", "searches": searches, "unique_queries": unique, "window": "24h"}
	} else {
		_ = database.Get(&table, `SELECT COALESCE(to_regclass('events')::text, '')`)
		if table != "" {
			var events int
			_ = database.Get(&events, `SELECT COUNT(*) FROM events WHERE tenant_id=$1`, middleware.GetTenantID(c))
			response = gin.H{"source": "events", "events": events, "window": "all_time"}
		}
	}
	httpx.OK(c, response)
}

func revenuePerMinute(c *gin.Context, database *sqlx.DB) {
	type bucket struct {
		Minute  time.Time `db:"minute" json:"minute"`
		Revenue float64   `db:"revenue" json:"revenue"`
		Orders  int       `db:"orders" json:"orders"`
	}
	rows := []bucket{}
	if database != nil {
		_ = database.Select(&rows, `
			SELECT minutes.minute,
				COALESCE(SUM(o.total),0) AS revenue,
				COUNT(o.id) AS orders
			FROM generate_series(
				date_trunc('minute', NOW()) - INTERVAL '59 minutes',
				date_trunc('minute', NOW()),
				INTERVAL '1 minute'
			) AS minutes(minute)
			LEFT JOIN orders o ON date_trunc('minute', o.created_at) = minutes.minute
				AND o.tenant_id=$1 AND o.status NOT IN ('cancelled', 'refunded')
			GROUP BY minutes.minute
			ORDER BY minutes.minute`, middleware.GetTenantID(c))
	}
	httpx.OK(c, gin.H{"buckets": rows, "currency": "UZS", "window_minutes": 60, "source": "postgres_orders"})
}

func insertCH(chURL string, body map[string]any) error {
	if chURL == "" {
		return nil
	}
	eventType, _ := body["event_type"].(string)
	tenantID, _ := body["tenant_id"].(string)
	userID, _ := body["user_id"].(string)
	entityID, _ := body["entity_id"].(string)
	region, _ := body["region"].(string)
	amount, _ := body["amount"].(float64)
	payload, _ := json.Marshal(body)
	query := `INSERT INTO marketplace.events FORMAT JSONEachRow`
	row, _ := json.Marshal(map[string]any{
		"event_time": time.Now().UTC().Format("2006-01-02 15:04:05"),
		"tenant_id":  tenantID,
		"event_type": eventType,
		"user_id":    userID,
		"entity_id":  entityID,
		"amount":     amount,
		"currency":   "UZS",
		"region":     region,
		"metadata":   string(payload),
	})
	resp, err := http.Post(chURL+"/?query="+url.QueryEscape(query), "application/json", bytes.NewReader(row))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)
	return nil
}

var allowedEventTypes = map[string]struct{}{
	"banner_impression":  {},
	"banner_click":       {},
	"product_impression": {},
	"product_click":      {},
	"product_view":       {},
	"add_to_cart":        {},
	"wishlist_add":       {},
}

type eventBody struct {
	EventType string         `json:"event_type"`
	EntityID  string         `json:"entity_id"`
	SessionID string         `json:"session_id"`
	Payload   map[string]any `json:"payload"`
}

func ingestEvent(c *gin.Context, database *sqlx.DB, chURL string) {
	var body eventBody
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, "invalid body")
		return
	}
	body.EventType = strings.TrimSpace(body.EventType)
	body.EntityID = strings.TrimSpace(body.EntityID)
	if body.EventType == "" || body.EntityID == "" {
		httpx.BadRequest(c, "event_type and entity_id required")
		return
	}
	if _, ok := allowedEventTypes[body.EventType]; !ok {
		httpx.BadRequest(c, "unsupported event_type")
		return
	}
	tenantID := middleware.GetTenantID(c)
	if tenantID == "" {
		httpx.BadRequest(c, "tenant required")
		return
	}
	userID := ""
	if claims := middleware.GetClaims(c); claims != nil {
		userID = claims.UserID
	}
	if body.Payload == nil {
		body.Payload = map[string]any{}
	}
	payloadJSON, _ := json.Marshal(body.Payload)

	if database != nil {
		var uid any
		if userID != "" {
			uid = userID
		}
		_, _ = database.Exec(`
			INSERT INTO analytics_event_mirror (tenant_id, event_type, entity_id, user_id, session_id, payload)
			VALUES ($1,$2,$3,$4,$5,$6)`,
			tenantID, body.EventType, body.EntityID, uid, nullIfEmpty(body.SessionID), payloadJSON)
	}

	_ = insertCH(chURL, map[string]any{
		"event_type": body.EventType,
		"tenant_id":  tenantID,
		"user_id":    userID,
		"entity_id":  body.EntityID,
		"session_id": body.SessionID,
		"payload":    body.Payload,
	})
	httpx.Created(c, gin.H{"ok": true})
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func daysWindow(c *gin.Context) int {
	d, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if d < 1 {
		d = 1
	}
	if d > 90 {
		d = 90
	}
	return d
}

func bannerAnalytics(c *gin.Context, database *sqlx.DB) {
	tenantID := middleware.GetTenantID(c)
	days := daysWindow(c)
	type row struct {
		BannerID    string  `db:"banner_id" json:"banner_id"`
		Kind        string  `db:"kind" json:"kind"`
		ImageURL    string  `db:"image_url" json:"image_url"`
		Link        string  `db:"link" json:"link"`
		Active      bool    `db:"active" json:"active"`
		Impressions int     `db:"impressions" json:"impressions"`
		Clicks      int     `db:"clicks" json:"clicks"`
		CTR         float64 `db:"ctr" json:"ctr"`
	}
	items := []row{}
	if database != nil {
		_ = database.Select(&items, `
			SELECT b.id AS banner_id,
				COALESCE(b.kind,'hero') AS kind,
				COALESCE(b.image_url,'') AS image_url,
				COALESCE(b.cta_href,'') AS link,
				COALESCE(b.active,true) AS active,
				COALESCE(SUM(CASE WHEN e.event_type='banner_impression' THEN 1 ELSE 0 END),0)::int AS impressions,
				COALESCE(SUM(CASE WHEN e.event_type='banner_click' THEN 1 ELSE 0 END),0)::int AS clicks,
				CASE WHEN COALESCE(SUM(CASE WHEN e.event_type='banner_impression' THEN 1 ELSE 0 END),0)=0 THEN 0
					ELSE ROUND(
						COALESCE(SUM(CASE WHEN e.event_type='banner_click' THEN 1 ELSE 0 END),0)::numeric
						/ NULLIF(SUM(CASE WHEN e.event_type='banner_impression' THEN 1 ELSE 0 END),0) * 100, 2
					)::float8 END AS ctr
			FROM hero_banners b
			LEFT JOIN analytics_event_mirror e
				ON e.tenant_id = b.tenant_id
				AND e.entity_id = b.id::text
				AND e.event_type IN ('banner_impression','banner_click')
				AND e.created_at >= NOW() - make_interval(days => $2::int)
			WHERE b.tenant_id=$1
			GROUP BY b.id, b.kind, b.image_url, b.cta_href, b.active, b.sort_order
			ORDER BY impressions DESC, b.sort_order ASC`, tenantID, days)
	}

	var totalImp, totalClick int
	for _, it := range items {
		totalImp += it.Impressions
		totalClick += it.Clicks
	}
	ctr := 0.0
	if totalImp > 0 {
		ctr = float64(totalClick) / float64(totalImp) * 100
	}
	httpx.OK(c, gin.H{
		"items": items, "days": days,
		"totals": gin.H{"impressions": totalImp, "clicks": totalClick, "ctr": ctr},
	})
}

func productAnalytics(c *gin.Context, database *sqlx.DB, vendorID string) {
	tenantID := middleware.GetTenantID(c)
	days := daysWindow(c)
	type row struct {
		ProductID   string  `db:"product_id" json:"product_id"`
		Title       string  `db:"title" json:"title"`
		Slug        string  `db:"slug" json:"slug"`
		Impressions int     `db:"impressions" json:"impressions"`
		Clicks      int     `db:"clicks" json:"clicks"`
		Views       int     `db:"views" json:"views"`
		AddToCart   int     `db:"add_to_cart" json:"add_to_cart"`
		Sold        int     `db:"sold" json:"sold"`
		Revenue     float64 `db:"revenue" json:"revenue"`
		CTR         float64 `db:"ctr" json:"ctr"`
		Conversion  float64 `db:"conversion" json:"conversion"`
	}
	items := []row{}
	if database == nil {
		httpx.OK(c, gin.H{"items": items, "days": days})
		return
	}

	vendorFilter := ""
	args := []any{tenantID, days}
	if vendorID != "" {
		vendorFilter = ` AND p.vendor_id=$3`
		args = append(args, vendorID)
	}

	q := `
		SELECT p.id AS product_id,
			COALESCE(p.translations->'uz'->>'name', p.slug) AS title,
			p.slug,
			COALESCE(SUM(CASE WHEN e.event_type='product_impression' THEN 1 ELSE 0 END),0)::int AS impressions,
			COALESCE(SUM(CASE WHEN e.event_type='product_click' THEN 1 ELSE 0 END),0)::int AS clicks,
			COALESCE(SUM(CASE WHEN e.event_type='product_view' THEN 1 ELSE 0 END),0)::int AS views,
			COALESCE(SUM(CASE WHEN e.event_type='add_to_cart' THEN 1 ELSE 0 END),0)::int AS add_to_cart,
			COALESCE((
				SELECT SUM(oi.quantity) FROM order_items oi
				WHERE oi.product_id=p.id AND oi.tenant_id=p.tenant_id
			),0)::int AS sold,
			COALESCE((
				SELECT SUM(oi.total_price) FROM order_items oi
				WHERE oi.product_id=p.id AND oi.tenant_id=p.tenant_id
			),0)::float8 AS revenue,
			CASE WHEN COALESCE(SUM(CASE WHEN e.event_type='product_impression' THEN 1 ELSE 0 END),0)=0 THEN 0
				ELSE ROUND(
					COALESCE(SUM(CASE WHEN e.event_type='product_click' THEN 1 ELSE 0 END),0)::numeric
					/ NULLIF(SUM(CASE WHEN e.event_type='product_impression' THEN 1 ELSE 0 END),0) * 100, 2
				)::float8 END AS ctr,
			CASE WHEN COALESCE(SUM(CASE WHEN e.event_type IN ('product_view','product_impression') THEN 1 ELSE 0 END),0)=0 THEN 0
				ELSE ROUND(
					COALESCE(SUM(CASE WHEN e.event_type='add_to_cart' THEN 1 ELSE 0 END),0)::numeric
					/ NULLIF(SUM(CASE WHEN e.event_type IN ('product_view','product_impression') THEN 1 ELSE 0 END),0) * 100, 2
				)::float8 END AS conversion
		FROM products p
		LEFT JOIN analytics_event_mirror e
			ON e.tenant_id = p.tenant_id
			AND e.entity_id = p.id::text
			AND e.event_type IN ('product_impression','product_click','product_view','add_to_cart')
			AND e.created_at >= NOW() - make_interval(days => $2::int)
		WHERE p.tenant_id=$1` + vendorFilter + `
		GROUP BY p.id, p.translations, p.slug
		HAVING COALESCE(SUM(CASE WHEN e.event_type IN ('product_impression','product_click','product_view','add_to_cart') THEN 1 ELSE 0 END),0) > 0
			OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id=p.id AND oi.tenant_id=p.tenant_id)
		ORDER BY views DESC, impressions DESC, sold DESC
		LIMIT 50`
	_ = database.Select(&items, q, args...)

	var totViews, totATC, totSold int
	for _, it := range items {
		totViews += it.Views + it.Impressions
		totATC += it.AddToCart
		totSold += it.Sold
	}
	httpx.OK(c, gin.H{
		"items": items, "days": days,
		"totals": gin.H{"views": totViews, "add_to_cart": totATC, "sold": totSold},
	})
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
