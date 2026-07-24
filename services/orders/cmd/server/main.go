package main

import (
	"log"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/db"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/orders/internal/config"
	"github.com/gayrat/marketplace/services/orders/internal/handler"
	"github.com/gayrat/marketplace/services/orders/internal/repository"
	"github.com/gayrat/marketplace/services/orders/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	database, _ := db.Connect(cfg.DatabaseURL)
	producer := kafkax.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()
	tokens := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	orders := &handler.OrderHandler{Service: service.NewOrderService(repository.NewOrderRepository(database), producer)}

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.TenantDB(database), middleware.AuditLogger(database), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	v1 := r.Group("/v1/orders")
	v1.POST("", middleware.JWT(tokens, true), orders.Create)
	v1.GET("", middleware.JWT(tokens, false), orders.List)
	v1.GET("/:id", middleware.JWT(tokens, true), orders.Get)
	v1.POST("/:id/cancel", middleware.JWT(tokens, false), orders.Cancel)
	v1.POST("/:id/status", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager, commonauth.RoleVendor), orders.Status)
	v1.POST("/:id/refund", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), orders.Refund)
	v1.GET("/:id/tracking", middleware.JWT(tokens, true), orders.Tracking)
	v1.PUT("/:id/tracking", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager, commonauth.RoleVendor), orders.SetTracking)
	v1.POST("/:id/returns", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleCustomer), orders.CreateReturn)
	v1.GET("/:id/returns", middleware.JWT(tokens, false), orders.Returns)
	admin := r.Group("/v1/admin/returns", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager))
	admin.GET("", orders.AdminReturns)
	admin.POST("/:id/:action", orders.ProcessReturn)
	log.Printf("orders-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
