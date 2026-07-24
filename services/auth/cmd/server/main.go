package main

import (
	"log"
	"net/http"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/config"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/packages/go-common/redisx"
	"github.com/gayrat/marketplace/services/auth/internal/handler"
	"github.com/gayrat/marketplace/services/auth/internal/repository"
	"github.com/gayrat/marketplace/services/auth/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load("auth-service")
	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Printf("warning: database unavailable, starting in degraded mode: %v", err)
	}
	rdb, err := redisx.Connect(cfg.RedisURL)
	if err != nil {
		log.Printf("warning: redis unavailable: %v", err)
		rdb = nil
	}

	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	var svc *service.AuthService
	if database != nil {
		repo := repository.NewUserRepo(database)
		svc = service.NewAuthService(repo, tokenMgr, rdb)
		if err := svc.BootstrapAdmin(); err != nil {
			log.Printf("bootstrap admin: %v", err)
		}
	}

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CorrelationID(), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.TenantDB(database), middleware.AuditLogger(database), middleware.Metrics(cfg.ServiceName))
	if rdb != nil {
		r.Use(middleware.RateLimit(rdb, 100, 1000))
	}
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": cfg.ServiceName, "jwt_alg": tokenMgr.Algorithm()})
	})
	r.GET("/.well-known/jwks.json", func(c *gin.Context) {
		c.Data(http.StatusOK, "application/json", tokenMgr.JWKS())
	})
	r.GET("/v1/auth/jwks", func(c *gin.Context) {
		c.Data(http.StatusOK, "application/json", tokenMgr.JWKS())
	})

	if svc != nil {
		h := handler.New(svc)
		v1 := r.Group("/v1/auth")
		{
			v1.POST("/register", h.Register)
			v1.POST("/login", h.Login)
			v1.POST("/refresh", h.Refresh)
			v1.POST("/logout", h.Logout)
			v1.POST("/forgot-password", h.ForgotPassword)
			v1.POST("/reset-password", h.ResetPassword)
			v1.POST("/otp/send", h.SendOTP)
			v1.POST("/otp/verify", h.VerifyOTP)
			v1.POST("/otp/email/send", h.SendEmailOTP)
			v1.POST("/otp/email/verify", h.VerifyEmailOTP)
			v1.POST("/oauth/:provider", h.OAuth)
			v1.POST("/request-email-verification", middleware.JWT(tokenMgr, false), h.RequestEmailVerification)
			v1.POST("/verify-email", h.VerifyEmail)
			v1.GET("/me", middleware.JWT(tokenMgr, false), h.Me)
			v1.PUT("/me", middleware.JWT(tokenMgr, false), h.UpdateMe)
			v1.GET("/export", middleware.JWT(tokenMgr, false), h.ExportGDPR)
			v1.DELETE("/me", middleware.JWT(tokenMgr, false), h.DeleteGDPR)
		}
		admin := r.Group("/v1/admin", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager, commonauth.RoleModerator))
		admin.GET("/users", h.AdminListUsers)
	}

	log.Printf("%s listening on :%s", cfg.ServiceName, cfg.HTTPPort)
	if err := r.Run(":" + cfg.HTTPPort); err != nil {
		log.Fatal(err)
	}
}
