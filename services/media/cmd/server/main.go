package main

import (
	"log"
	"os"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/config"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/media/internal/handler"
	"github.com/gayrat/marketplace/services/media/internal/repository"
	"github.com/gayrat/marketplace/services/media/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load("media-service")
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8011"
	}
	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Printf("db warning: %v", err)
	}
	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	storage := service.NewStorage(cfg)

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok", "service": cfg.ServiceName}) })

	v1 := r.Group("/v1/media")
	handler.New(tokenMgr, repository.New(database), storage, cfg.MinioBucket).Register(v1)

	log.Printf("media-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
