package handler

import (
	"os"
	"time"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/realtime/internal/model"
	"github.com/gayrat/marketplace/services/realtime/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type Handler struct {
	tokenMgr *commonauth.Manager
	centrifugo *repository.CentrifugoClient
	secret string
}

func New(tokenMgr *commonauth.Manager, centrifugo *repository.CentrifugoClient, secret string) *Handler {
	return &Handler{tokenMgr: tokenMgr, centrifugo: centrifugo, secret: secret}
}

func (h *Handler) Register(r *gin.RouterGroup) {
	r.POST("/token", middleware.JWT(h.tokenMgr, false), h.token)
	r.POST("/publish", middleware.JWT(h.tokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), h.publish)
}

func (h *Handler) token(c *gin.Context) {
	claims := middleware.GetClaims(c)
	now := time.Now()
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": claims.UserID, "exp": now.Add(time.Hour).Unix(), "iat": now.Unix(), "channels": []string{"orders:#" + claims.UserID, "notifications:#" + claims.UserID}})
	signed, err := t.SignedString([]byte(h.secret))
	if err != nil { httpx.Internal(c, err.Error()); return }
	wsURL := os.Getenv("CENTRIFUGO_WS_URL")
	if wsURL == "" {
		wsURL = "ws://localhost:8100/connection/websocket"
	}
	httpx.OK(c, gin.H{"token": signed, "url": wsURL})
}

func (h *Handler) publish(c *gin.Context) {
	var body model.PublishRequest
	if err := c.ShouldBindJSON(&body); err != nil { httpx.BadRequest(c, err.Error()); return }
	if err := h.centrifugo.Publish(body.Channel, body.Data); err != nil {
		httpx.OK(c, gin.H{"published": false, "error": err.Error(), "queued": true}); return
	}
	httpx.OK(c, gin.H{"published": true})
}
