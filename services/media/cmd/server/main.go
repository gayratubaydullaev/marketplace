package main

import (
	"context"
	"log"
	"os"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/config"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/packages/go-common/otelx"
	"github.com/gayrat/marketplace/services/media/internal/handler"
	"github.com/gayrat/marketplace/services/media/internal/repository"
	"github.com/gayrat/marketplace/services/media/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load("media-service")
	if err := cfg.ValidateSecrets(); err != nil {
		log.Fatal(err)
	}
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8011"
	}
	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	storage := service.NewStorage(cfg)

	shutdown, _ := otelx.Init(cfg.ServiceName)
	defer func() { _ = shutdown(context.Background()) }()
	r := gin.New()
	middleware.SecureEngine(r)
	r.Use(gin.Recovery(), otelx.Middleware(cfg.ServiceName), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.SanitizeGuest(), middleware.TenantDB(database), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok", "service": cfg.ServiceName}) })

	v1 := r.Group("/v1/media")
	handler.New(tokenMgr, repository.New(database), storage, cfg.MinioBucket).Register(v1)

	log.Printf("media-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
