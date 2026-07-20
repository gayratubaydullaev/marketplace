package handler

import (
	"encoding/json"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/orders/internal/model"
	"github.com/gayrat/marketplace/services/orders/internal/service"
	"github.com/gin-gonic/gin"
)

type OrderHandler struct{ Service *service.OrderService }

func (h *OrderHandler) Create(c *gin.Context) {
	var body struct {
		CartID          string          `json:"cart_id"`
		GuestEmail      string          `json:"guest_email"`
		ShippingAddress json.RawMessage `json:"shipping_address" binding:"required"`
		Notes           string          `json:"notes"`
		AddressID       string          `json:"address_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	claims := middleware.GetClaims(c)
	input := service.CreateInput{
		CartID:          body.CartID,
		GuestEmail:      body.GuestEmail,
		GuestID:         c.GetHeader("X-Guest-ID"),
		ShippingAddress: body.ShippingAddress,
		Notes:           body.Notes,
		AddressID:       body.AddressID,
		TenantID:        middleware.GetTenantID(c),
	}
	if claims != nil {
		input.UserID = claims.UserID
	}
	if body.AddressID != "" && claims != nil {
		var address json.RawMessage
		if err := h.Service.Repo.DB.QueryRow(`SELECT jsonb_build_object('region',region,'district',district,'mahalla',mahalla,'street',street,'building',building,'apartment',apartment,'phone',phone,'full_name',full_name) FROM addresses WHERE id=$1 AND user_id=$2`, body.AddressID, claims.UserID).Scan(&address); err == nil {
			input.ShippingAddress = address
		}
	}
	result, err := h.Service.Create(c.Request.Context(), input)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.Created(c, result)
}

func (h *OrderHandler) List(c *gin.Context) {
	claims := middleware.GetClaims(c)
	orders, err := h.Service.Repo.List(middleware.GetTenantID(c), claims.UserID, claims.Role == commonauth.RoleCustomer)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if orders == nil {
		orders = []model.Order{}
	}
	httpx.OK(c, gin.H{"items": orders})
}

func (h *OrderHandler) Get(c *gin.Context) {
	order, items, err := h.Service.Repo.Get(c.Param("id"), middleware.GetTenantID(c))
	if err != nil {
		httpx.NotFound(c, "order not found")
		return
	}
	if !canViewOrder(c, order) {
		httpx.NotFound(c, "order not found")
		return
	}
	if items == nil {
		items = []model.OrderItem{}
	}
	httpx.OK(c, gin.H{"order": order, "items": items})
}

func canViewOrder(c *gin.Context, order model.Order) bool {
	claims := middleware.GetClaims(c)
	if claims == nil {
		return order.UserID == nil
	}
	switch claims.Role {
	case commonauth.RoleTenantAdmin, commonauth.RoleManager, commonauth.RoleVendor:
		return true
	default:
		return order.UserID != nil && *order.UserID == claims.UserID
	}
}

func (h *OrderHandler) Cancel(c *gin.Context) {
	order, _, err := h.Service.Repo.Get(c.Param("id"), middleware.GetTenantID(c))
	if err != nil {
		httpx.NotFound(c, "order not found")
		return
	}
	claims := middleware.GetClaims(c)
	allowed := false
	if claims != nil {
		switch claims.Role {
		case commonauth.RoleTenantAdmin, commonauth.RoleManager:
			allowed = true
		default:
			allowed = order.UserID != nil && *order.UserID == claims.UserID
		}
	}
	if !allowed {
		httpx.NotFound(c, "order not found")
		return
	}
	h.transition(c, "cancelled")
}
func (h *OrderHandler) Refund(c *gin.Context) {
	if err := h.Service.Refund(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c)); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"id": c.Param("id"), "payment_status": "refunded"})
}
func (h *OrderHandler) Status(c *gin.Context) {
	var body struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	h.transition(c, body.Status)
}
func (h *OrderHandler) transition(c *gin.Context, status string) {
	if err := h.Service.Transition(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c), status); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"id": c.Param("id"), "status": status})
}
func (h *OrderHandler) Tracking(c *gin.Context) {
	order, _, err := h.Service.Repo.Get(c.Param("id"), middleware.GetTenantID(c))
	if err != nil || !canViewOrder(c, order) {
		httpx.NotFound(c, "order not found")
		return
	}
	id := c.Param("id")
	if len(id) < 8 {
		httpx.BadRequest(c, "invalid order id")
		return
	}
	httpx.OK(c, gin.H{"order_id": id, "carrier": "BTS Express", "tracking_number": "UZ" + id[:8], "status": "in_transit"})
}
