package main

import (
	"context"
	"log"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/db"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/packages/go-common/otelx"
	"github.com/gayrat/marketplace/packages/go-common/redisx"
	"github.com/gayrat/marketplace/services/payments/internal/config"
	"github.com/gayrat/marketplace/services/payments/internal/handler"
	"github.com/gayrat/marketplace/services/payments/internal/repository"
	"github.com/gayrat/marketplace/services/payments/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	if err := cfg.ValidateSecrets(); err != nil {
		log.Fatal(err)
	}
	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	if err := service.ValidateProviderSecrets(); err != nil {
		log.Fatal(err)
	}
	rdb, err := redisx.Connect(cfg.RedisURL)
	if err != nil {
		log.Printf("redis: %v", err)
		rdb = nil
	}
	producer := kafkax.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()
	tokens := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	payments := &handler.PaymentHandler{Service: service.New(repository.NewPaymentRepository(database), producer), Providers: service.Providers(), Sandbox: service.Sandbox()}
	shutdown, _ := otelx.Init(cfg.ServiceName)
	defer func() { _ = shutdown(context.Background()) }()
	r := gin.New()
	middleware.SecureEngine(r)
	r.Use(gin.Recovery(), otelx.Middleware(cfg.ServiceName), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.SanitizeGuest(), middleware.TenantDB(database), middleware.AuditLogger(database), middleware.Metrics(cfg.ServiceName))
	if rdb != nil {
		r.Use(middleware.RateLimit(rdb, 40, 200))
	}
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok", "sandbox": payments.Sandbox}) })
	v1 := r.Group("/v1/payments")
	v1.GET("/providers", payments.ProvidersList)
	v1.POST("/intent", middleware.JWT(tokens, true), payments.Intent)
	v1.POST("/confirm", middleware.JWT(tokens, true), payments.Confirm)
	v1.POST("/collect", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager, commonauth.RoleVendor, commonauth.RoleCourier), payments.Collect)
	v1.POST("/refund", middleware.JWT(tokens, true), payments.Refund)
	v1.POST("/webhooks/:provider", payments.Webhook)
	v1.GET("/order/:order_id", middleware.JWT(tokens, false), payments.List)
	v1.GET("/:id/status", middleware.JWT(tokens, true), payments.GetStatus)
	if payments.Sandbox {
		v1.GET("/sandbox/pay/:id", payments.SandboxPayPage)
		v1.POST("/sandbox/pay/:id", payments.SandboxPayPage)
	}
	log.Printf("payments-service on :%s sandbox=%v", cfg.HTTPPort, payments.Sandbox)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
