package main

import (
	"log"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/db"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/payments/internal/config"
	"github.com/gayrat/marketplace/services/payments/internal/handler"
	"github.com/gayrat/marketplace/services/payments/internal/repository"
	"github.com/gayrat/marketplace/services/payments/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	database, _ := db.Connect(cfg.DatabaseURL)
	if database != nil {
		_, _ = database.Exec(`CREATE TABLE IF NOT EXISTS payment_splits (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id UUID NOT NULL,
			payment_id UUID NOT NULL,
			order_id UUID NOT NULL,
			vendor_id UUID,
			gross_amount DECIMAL(14,2) NOT NULL,
			commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10,
			commission_amount DECIMAL(14,2) NOT NULL,
			vendor_amount DECIMAL(14,2) NOT NULL,
			currency VARCHAR(3) DEFAULT 'UZS',
			status VARCHAR(20) DEFAULT 'pending',
			payout_id UUID,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`)
		_, _ = database.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tenant_idempotency ON payments (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''`)
		_, _ = database.Exec(`CREATE INDEX IF NOT EXISTS idx_payment_splits_payment_pending ON payment_splits (payment_id, status)`)
		_, _ = database.Exec(`CREATE INDEX IF NOT EXISTS idx_payment_splits_vendor_pending ON payment_splits (tenant_id, vendor_id, status) WHERE vendor_id IS NOT NULL AND status = 'pending'`)
		// Ledger writes happen in service transactions; FORCE RLS without a
		// dedicated app role breaks inserts for the schema owner in local/dev.
		_, _ = database.Exec(`ALTER TABLE IF EXISTS payment_splits NO FORCE ROW LEVEL SECURITY`)
	}
	producer := kafkax.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()
	tokens := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	payments := &handler.PaymentHandler{Service: service.New(repository.NewPaymentRepository(database), producer), Providers: service.Providers(), Sandbox: service.Sandbox()}
	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.TenantDB(database), middleware.AuditLogger(database), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok", "sandbox": payments.Sandbox}) })
	v1 := r.Group("/v1/payments")
	v1.GET("/providers", payments.ProvidersList)
	v1.POST("/intent", middleware.JWT(tokens, true), payments.Intent)
	v1.POST("/confirm", middleware.JWT(tokens, true), payments.Confirm)
	v1.POST("/webhooks/:provider", payments.Webhook)
	v1.GET("/order/:order_id", middleware.JWT(tokens, false), payments.List)
	v1.GET("/:id/status", middleware.JWT(tokens, true), payments.GetStatus)
	v1.GET("/sandbox/pay/:id", payments.SandboxPayPage)
	v1.POST("/sandbox/pay/:id", payments.SandboxPayPage)
	log.Printf("payments-service on :%s sandbox=%v", cfg.HTTPPort, payments.Sandbox)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
