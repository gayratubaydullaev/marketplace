package main

import (
	"log"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/db"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/vendor-service/internal/config"
	"github.com/gayrat/marketplace/services/vendor-service/internal/handler"
	"github.com/gayrat/marketplace/services/vendor-service/internal/repository"
	"github.com/gayrat/marketplace/services/vendor-service/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	database, _ := db.Connect(cfg.DatabaseURL)
	producer := kafkax.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()
	tokens := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	vendors := &handler.VendorHandler{Service: service.NewVendorService(repository.NewVendorRepository(database), producer)}

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.Tenant(), middleware.TenantDB(database), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	v1 := r.Group("/v1")
	v1.POST("/vendors/apply", middleware.JWT(tokens, false), vendors.Apply)
	v1.GET("/vendors", vendors.List)
	v1.GET("/tenant/mode", vendors.TenantMode)
	v1.GET("/vendors/:slug", vendors.Get)
	v1.GET("/vendors/:slug/products", vendors.Products)
	v1.GET("/vendors/:slug/reviews", vendors.Reviews)

	dash := v1.Group("/vendor", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin))
	dash.GET("/dashboard/stats", vendors.Stats)
	dash.GET("/orders", vendors.Orders)
	dash.GET("/products", vendors.MyProducts)
	dash.GET("/payouts", vendors.Payouts)
	dash.GET("/settings", vendors.Settings)
	dash.PUT("/settings", vendors.UpdateSettings)

	admin := v1.Group("/admin/vendors", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleModerator))
	admin.GET("", vendors.AdminList)
	admin.POST("/:id/approve", vendors.Approve)
	admin.POST("/:id/suspend", vendors.Suspend)
	admin.PUT("/:id/commission", vendors.SetCommission)
	v1.POST("/admin/tenant/mode", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleSuperAdmin), vendors.SwitchMode)
	v1.PUT("/admin/tenant/settings", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleSuperAdmin), vendors.UpdateTenantSettings)
	v1.POST("/admin/payouts/run", middleware.JWT(tokens, false), middleware.RequireRoles(commonauth.RoleTenantAdmin), vendors.RunPayouts)

	log.Printf("vendor-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
