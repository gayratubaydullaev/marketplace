package middleware

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
)

const (
	CtxClaimsKey = "claims"
	CtxTenantKey = "tenant_id"
	CtxDBKey     = "sqlx_db"
)

func CORSAllowlist() []string {
	raw := strings.TrimSpace(os.Getenv("CORS_ORIGINS"))
	if raw == "" {
		return []string{
			"http://localhost:3000",
			"http://localhost:3001",
			"http://localhost:3002",
		}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && p != "*" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{"http://localhost:3000"}
	}
	return out
}

func CORS() gin.HandlerFunc {
	allowed := CORSAllowlist()
	allowSet := map[string]struct{}{}
	for _, o := range allowed {
		allowSet[o] = struct{}{}
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			if _, ok := allowSet[origin]; ok {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Access-Control-Allow-Credentials", "true")
				c.Header("Vary", "Origin")
			}
		}
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Tenant-ID,X-Locale,X-Guest-ID,X-Request-ID,X-Correlation-ID,Idempotency-Key")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// SecurityHeaders mirrors Kong response-transformer defaults.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'")
		if os.Getenv("APP_ENV") == "production" || os.Getenv("APP_ENV") == "prod" {
			c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		c.Next()
	}
}

// MaxBodyBytes rejects oversized JSON bodies (default 10 MiB, Kong-aligned).
func MaxBodyBytes(n int64) gin.HandlerFunc {
	if n <= 0 {
		n = 10 << 20
	}
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, n)
		}
		c.Next()
	}
}

// CorrelationID attaches X-Request-ID / X-Correlation-ID for tracing.
func CorrelationID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Correlation-ID")
		if id == "" {
			id = c.GetHeader("X-Request-ID")
		}
		if id == "" {
			id = fmt.Sprintf("%d", time.Now().UnixNano())
		}
		c.Set("correlation_id", id)
		c.Header("X-Request-ID", id)
		c.Header("X-Correlation-ID", id)
		c.Next()
	}
}

func Tenant() gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID := c.GetHeader("X-Tenant-ID")
		if tenantID == "" {
			tenantID = c.Query("tenant_id")
		}
		if tenantID == "" {
			tenantID = "00000000-0000-0000-0000-000000000001" // default seed tenant
		}
		c.Set(CtxTenantKey, tenantID)
		c.Next()
	}
}

// TenantDB applies app.current_tenant for Postgres RLS before handlers run.
func TenantDB(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if database != nil {
			c.Set(CtxDBKey, database)
			_ = db.SetTenant(database, GetTenantID(c))
		}
		c.Next()
	}
}

func JWT(manager *auth.Manager, optional bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			if optional {
				c.Next()
				return
			}
			httpx.Unauthorized(c, "missing authorization header")
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			httpx.Unauthorized(c, "invalid authorization header")
			return
		}
		claims, err := manager.Parse(parts[1])
		if err != nil {
			httpx.Unauthorized(c, "invalid or expired token")
			return
		}
		// Authenticated requests must not spoof tenant via header.
		if hdr := c.GetHeader("X-Tenant-ID"); hdr != "" && hdr != claims.TenantID {
			httpx.Forbidden(c, "tenant header does not match token")
			return
		}
		c.Set(CtxClaimsKey, claims)
		c.Set(CtxTenantKey, claims.TenantID)
		if v, ok := c.Get(CtxDBKey); ok {
			if database, ok := v.(*sqlx.DB); ok && database != nil {
				_ = db.SetTenant(database, claims.TenantID)
			}
		}
		c.Next()
	}
}

func RequireRoles(roles ...auth.Role) gin.HandlerFunc {
	allowed := map[auth.Role]struct{}{}
	for _, r := range roles {
		allowed[r] = struct{}{}
	}
	return func(c *gin.Context) {
		v, ok := c.Get(CtxClaimsKey)
		if !ok {
			httpx.Unauthorized(c, "authentication required")
			return
		}
		claims := v.(*auth.Claims)
		if _, ok := allowed[claims.Role]; !ok {
			httpx.Forbidden(c, "insufficient permissions")
			return
		}
		c.Next()
	}
}

func RateLimit(rdb *redis.Client, anonLimit, authLimit int) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rdb == nil {
			c.Next()
			return
		}
		limit := anonLimit
		keyPart := c.ClientIP()
		if v, ok := c.Get(CtxClaimsKey); ok {
			limit = authLimit
			claims := v.(*auth.Claims)
			keyPart = claims.UserID
		}
		key := fmt.Sprintf("rl:%s:%d", keyPart, time.Now().Unix()/60)
		ctx := context.Background()
		n, err := rdb.Incr(ctx, key).Result()
		if err == nil && n == 1 {
			rdb.Expire(ctx, key, 2*time.Minute)
		}
		if err == nil && int(n) > limit {
			httpx.Fail(c, http.StatusTooManyRequests, "rate_limited", "too many requests")
			return
		}
		c.Next()
	}
}

func Metrics(serviceName string) gin.HandlerFunc {
	reqCount := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total HTTP requests",
		ConstLabels: prometheus.Labels{"service": serviceName},
	}, []string{"method", "path", "status"})
	reqDuration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request duration",
		Buckets: prometheus.DefBuckets,
		ConstLabels: prometheus.Labels{"service": serviceName},
	}, []string{"method", "path"})
	_ = prometheus.Register(reqCount)
	_ = prometheus.Register(reqDuration)

	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}
		reqCount.WithLabelValues(c.Request.Method, path, fmt.Sprintf("%d", c.Writer.Status())).Inc()
		reqDuration.WithLabelValues(c.Request.Method, path).Observe(time.Since(start).Seconds())
	}
}

func MountMetrics(r *gin.Engine) {
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))
}

func GetClaims(c *gin.Context) *auth.Claims {
	v, ok := c.Get(CtxClaimsKey)
	if !ok {
		return nil
	}
	return v.(*auth.Claims)
}

func GetTenantID(c *gin.Context) string {
	if v, ok := c.Get(CtxTenantKey); ok {
		return v.(string)
	}
	return ""
}
