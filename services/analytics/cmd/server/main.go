package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
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
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8010"
	}
	database, _ := db.Connect(cfg.DatabaseURL)
	rdb, _ := redisx.Connect(cfg.RedisURL)
	chURL := cfg.ClickHouseURL
	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.Tenant(), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

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
		v1.POST("/events", func(c *gin.Context) {
			var body map[string]any
			_ = c.ShouldBindJSON(&body)
			_ = insertCH(chURL, body)
			httpx.Created(c, gin.H{"ok": true})
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

	httpx.OK(c, gin.H{
		"revenue": revenue, "orders": orders, "customers": customers, "currency": "UZS",
		"top_products": top, "top_vendors": vendors, "geo": geoRows, "conversion": 0.0,
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

	httpx.OK(c, gin.H{
		"sales": revenue + commission, "revenue": revenue, "commission": commission, "orders": orders, "currency": "UZS",
		"top_products": top,
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
	eventType, _ := body["event_type"].(string)
	tenantID, _ := body["tenant_id"].(string)
	userID, _ := body["user_id"].(string)
	entityID, _ := body["entity_id"].(string)
	region, _ := body["region"].(string)
	amount, _ := body["amount"].(float64)
	payload, _ := json.Marshal(body)
	// Parameterized via HTTP body + query placeholders (ClickHouse HTTP protocol)
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
		"payload":    string(payload),
	})
	resp, err := http.Post(chURL+"/?query="+url.QueryEscape(query), "application/json", bytes.NewReader(row))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.ReadAll(resp.Body)
	return nil
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
