package main

import (
	"log"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/db"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/catalog/internal/config"
	"github.com/gayrat/marketplace/services/catalog/internal/grpcx"
	"github.com/gayrat/marketplace/services/catalog/internal/handler"
	"github.com/gayrat/marketplace/services/catalog/internal/repository"
	"github.com/gayrat/marketplace/services/catalog/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Printf("db warning: %v", err)
	}
	producer := kafkax.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()
	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	repo := repository.New(database)
	grpcx.ListenAndServe(repo)

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.Tenant(), middleware.TenantDB(database), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok", "service": cfg.ServiceName}) })
	handler.New(service.New(repo), producer, tokenMgr).Register(r)

	log.Printf("%s on :%s", cfg.ServiceName, cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
