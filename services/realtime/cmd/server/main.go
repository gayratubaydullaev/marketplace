package main

import (
	"log"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/realtime/internal/config"
	"github.com/gayrat/marketplace/services/realtime/internal/handler"
	"github.com/gayrat/marketplace/services/realtime/internal/repository"
	"github.com/gayrat/marketplace/services/realtime/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	if cfg.CentrifugoURL == "http://localhost:8000" {
		cfg.CentrifugoURL = "http://localhost:8100"
	}
	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	centrifugo := repository.NewCentrifugoClient(cfg.CentrifugoURL)
	service.NewBridge(cfg.KafkaBrokers, centrifugo).Start()

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.Tenant(), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	v1 := r.Group("/v1/realtime")
	handler.New(tokenMgr, centrifugo, cfg.CentrifugoSecret).Register(v1)

	log.Printf("realtime-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}
