package main

import (
	"context"
	"log"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/packages/go-common/otelx"
	"github.com/gayrat/marketplace/packages/go-common/redisx"
	"github.com/gayrat/marketplace/services/delivery/internal/config"
	"github.com/gayrat/marketplace/services/delivery/internal/handler"
	"github.com/gayrat/marketplace/services/delivery/internal/service"
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
	rdb, err := redisx.Connect(cfg.RedisURL)
	if err != nil {
		log.Printf("redis: %v", err)
		rdb = nil
	}
	tokens := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	h := &handler.Handler{Svc: service.New(database, cfg.PaymentsURL, cfg.YandexGeocoderAPIKey)}

	shutdown, _ := otelx.Init(cfg.ServiceName)
	defer func() { _ = shutdown(context.Background()) }()
	r := gin.New()
	middleware.SecureEngine(r)
	r.Use(
		gin.Recovery(),
		otelx.Middleware(cfg.ServiceName),
		middleware.CorrelationID(),
		middleware.CORS(),
		middleware.SecurityHeaders(),
		middleware.MaxBodyBytes(1<<20),
		middleware.Tenant(), middleware.SanitizeGuest(),
		middleware.TenantDB(database),
		middleware.Metrics(cfg.ServiceName),
	)
	if rdb != nil {
		r.Use(middleware.RateLimit(rdb, 60, 300))
	}
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	adminRoles := middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager, commonauth.RoleSuperAdmin)
	vendorRoles := middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin, commonauth.RoleManager)

	admin := r.Group("/v1/admin", middleware.JWT(tokens, false), adminRoles)
	{
		admin.GET("/couriers", h.AdminListCouriers)
		admin.POST("/couriers", h.AdminCreateCourier)
		admin.POST("/couriers/:id/approve", h.AdminApproveCourier)
		admin.POST("/couriers/:id/block", h.AdminBlockCourier)
		admin.GET("/courier-shifts", h.AdminShifts)
		admin.GET("/deliveries", h.AdminListJobs)
		admin.GET("/deliveries/:id", h.AdminGetJob)
		admin.POST("/deliveries/auto-assign", h.AdminAutoAssign)
		admin.POST("/deliveries/:id/assign", h.AdminAssign)
		admin.POST("/deliveries/:id/auto-assign", h.AdminAutoAssignJob)
		admin.POST("/deliveries/:id/reassign", h.AdminReassign)
		admin.POST("/deliveries/:id/retry-assign", h.AdminRetryAssign)
		admin.GET("/deliveries/:id/messages", h.AdminListMessages)
		admin.POST("/deliveries/:id/messages", h.AdminPostMessage)
		admin.GET("/courier-ratings", h.AdminListRatings)
		admin.GET("/courier-payouts", h.AdminListPayouts)
		admin.POST("/courier-payouts", h.AdminCreatePayout)
		admin.POST("/courier-payouts/:id/paid", h.AdminMarkPayoutPaid)
	}

	delivery := r.Group("/v1/delivery", middleware.JWT(tokens, false))
	{
		delivery.POST("/ready-for-delivery", vendorRoles, h.ReadyForDelivery)
		delivery.POST("/orders/:id/ready", vendorRoles, h.ReadyForDelivery)
		delivery.GET("/orders/:id", h.GetJobByOrder)
		delivery.GET("/orders/:id/live", h.LiveByOrder)
		delivery.POST("/orders/:id/rate", middleware.JWT(tokens, true), h.RateByOrder)
		delivery.GET("/orders/:id/messages", h.OrderMessagesList)
		delivery.POST("/orders/:id/messages", h.OrderMessagesPost)
	}

	geo := r.Group("/v1/delivery/geo", middleware.JWT(tokens, true))
	if rdb != nil {
		geo.Use(middleware.RateLimit(rdb, 20, 60))
	}
	{
		geo.GET("/search", h.GeoSearch)
		geo.GET("/reverse", h.GeoReverse)
	}

	orders := r.Group("/v1/orders", middleware.JWT(tokens, false), vendorRoles)
	orders.POST("/:id/ready-for-delivery", h.ReadyForDeliveryOrdersPath)

	courier := r.Group("/v1/courier", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleCourier))
	if rdb != nil {
		courier.Use(middleware.RateLimit(rdb, 30, 120))
	}
	{
		courier.GET("/me", h.Me)
		courier.PUT("/me", h.UpdateMe)
		courier.POST("/location", h.Location)
		courier.POST("/shifts/open", h.OpenShift)
		courier.POST("/shifts/close", h.CloseShift)
		courier.GET("/jobs", h.CourierJobs)
		courier.GET("/jobs/:id", h.CourierJob)
		courier.POST("/jobs/:id/collect-cod", h.CourierCollectCOD)
		courier.GET("/jobs/:id/messages", h.CourierMessagesList)
		courier.POST("/jobs/:id/messages", h.CourierMessagesPost)
		courier.POST("/jobs/:id/accept", h.CourierJobActionFixed("accept"))
		courier.POST("/jobs/:id/arrive-pickup", h.CourierJobActionFixed("arrive-pickup"))
		courier.POST("/jobs/:id/picked-up", h.CourierJobActionFixed("picked-up"))
		courier.POST("/jobs/:id/in-transit", h.CourierJobActionFixed("in-transit"))
		courier.POST("/jobs/:id/delivered", h.CourierJobActionFixed("delivered"))
		courier.GET("/route", h.CourierRoute)
		courier.GET("/payouts", h.CourierPayouts)
		courier.GET("/earnings", h.CourierEarnings)
	}

	log.Printf("delivery-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
