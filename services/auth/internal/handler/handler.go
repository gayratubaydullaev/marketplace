package handler

import (
	"net/http"

	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/auth/internal/model"
	"github.com/gayrat/marketplace/services/auth/internal/service"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *service.AuthService
}

func New(svc *service.AuthService) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Register(c *gin.Context) {
	var req model.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	u, tokens, err := h.svc.Register(middleware.GetTenantID(c), req)
	if err != nil {
		httpx.Conflict(c, err.Error())
		return
	}
	httpx.Created(c, gin.H{"user": u, "tokens": tokens})
}

func (h *Handler) Login(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	u, tokens, err := h.svc.Login(middleware.GetTenantID(c), req)
	if err != nil {
		httpx.Unauthorized(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"user": u, "tokens": tokens})
}

func (h *Handler) Refresh(c *gin.Context) {
	var body struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	tokens, err := h.svc.Refresh(body.RefreshToken)
	if err != nil {
		httpx.Unauthorized(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"tokens": tokens})
}

func (h *Handler) Logout(c *gin.Context) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.RefreshToken != "" {
		_ = h.svc.Logout(body.RefreshToken)
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) Me(c *gin.Context) {
	claims := middleware.GetClaims(c)
	u, err := h.svc.Me(claims.UserID)
	if err != nil || u == nil {
		httpx.NotFound(c, "user not found")
		return
	}
	httpx.OK(c, u)
}

func (h *Handler) UpdateMe(c *gin.Context) {
	claims := middleware.GetClaims(c)
	var req model.UpdateMeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	u, err := h.svc.UpdateMe(claims.UserID, req)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, u)
}

func (h *Handler) ForgotPassword(c *gin.Context) {
	var req model.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	token, _ := h.svc.ForgotPassword(middleware.GetTenantID(c), req.Email)
	resp := gin.H{"message": "if the email exists, a reset link was sent"}
	if token != "" {
		resp["dev_token"] = token
	}
	httpx.OK(c, resp)
}

func (h *Handler) ResetPassword(c *gin.Context) {
	var req model.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if err := h.svc.ResetPassword(req.Token, req.NewPassword); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"message": "password updated"})
}

func (h *Handler) SendOTP(c *gin.Context) {
	var req model.OTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	code, err := h.svc.SendOTP(req.Phone)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"message": "otp sent", "dev_code": code})
}

func (h *Handler) VerifyOTP(c *gin.Context) {
	var req model.OTPVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	u, tokens, err := h.svc.VerifyOTP(middleware.GetTenantID(c), req.Phone, req.Code)
	if err != nil {
		httpx.Unauthorized(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"user": u, "tokens": tokens})
}

func (h *Handler) OAuth(c *gin.Context) {
	provider := c.Param("provider")
	var req model.OAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	req.Provider = provider
	u, tokens, err := h.svc.OAuth(middleware.GetTenantID(c), req)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"user": u, "tokens": tokens})
}

func (h *Handler) RequestEmailVerification(c *gin.Context) {
	claims := middleware.GetClaims(c)
	token, err := h.svc.RequestEmailVerification(claims.UserID)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	resp := gin.H{"message": "verification email queued"}
	if token != "" {
		resp["dev_token"] = token
	}
	httpx.OK(c, resp)
}

func (h *Handler) VerifyEmail(c *gin.Context) {
	var req model.VerifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if err := h.svc.VerifyEmail(req.Token); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"message": "email verified"})
}

func (h *Handler) AdminListUsers(c *gin.Context) {
	users, err := h.svc.ListUsers(middleware.GetTenantID(c), 100)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": users})
}

func (h *Handler) ExportGDPR(c *gin.Context) {
	claims := middleware.GetClaims(c)
	u, err := h.svc.Me(claims.UserID)
	if err != nil {
		httpx.NotFound(c, "user not found")
		return
	}
	httpx.OK(c, gin.H{"exported_at": "now", "user": u})
}

func (h *Handler) DeleteGDPR(c *gin.Context) {
	claims := middleware.GetClaims(c)
	if err := h.svc.AnonymizeUser(claims.UserID); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"status": "anonymized", "user_id": claims.UserID})
}
