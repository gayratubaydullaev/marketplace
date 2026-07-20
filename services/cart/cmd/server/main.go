package main

import (
	"log"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/cart/internal/config"
	"github.com/gayrat/marketplace/services/cart/internal/handler"
	"github.com/gayrat/marketplace/services/cart/internal/repository"
	"github.com/gayrat/marketplace/services/cart/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Printf("db: %v", err)
	}
	tokens := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	cart := &handler.CartHandler{Service: service.NewCartService(repository.NewCartRepository(database))}

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.Tenant(), middleware.TenantDB(database), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	v1 := r.Group("/v1")
	carts := v1.Group("/cart", middleware.JWT(tokens, true))
	{
		carts.GET("", cart.GetCart)
		carts.POST("/items", cart.AddItem)
		carts.PUT("/items/:id", cart.UpdateItem)
		carts.DELETE("/items/:id", cart.RemoveItem)
		carts.POST("/apply-coupon", cart.ApplyCoupon)
		carts.DELETE("/coupon", cart.RemoveCoupon)
		carts.POST("/apply-gift", cart.ApplyGift)
		carts.DELETE("/gift", cart.RemoveGift)
		carts.POST("/shipping-estimate", cart.ShippingEstimate)
		carts.POST("/checkout-preview", cart.CheckoutPreview)
		carts.POST("/merge", middleware.JWT(tokens, false), cart.MergeGuest)
	}

	addresses := v1.Group("/addresses", middleware.JWT(tokens, false))
	addresses.GET("", cart.ListAddresses)
	addresses.POST("", cart.CreateAddress)
	addresses.PUT("/:id", cart.UpdateAddress)
	addresses.DELETE("/:id", cart.DeleteAddress)

	log.Printf("cart-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
