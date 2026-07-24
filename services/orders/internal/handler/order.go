package handler

import (
	"encoding/json"
	"fmt"

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
	middleware.WriteAudit(c, "refund", "order", c.Param("id"), nil, gin.H{"payment_status": "refunded"})
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
	middleware.WriteAudit(c, "transition", "order", c.Param("id"), nil, gin.H{"status": status})
	httpx.OK(c, gin.H{"id": c.Param("id"), "status": status})
}
func (h *OrderHandler) Tracking(c *gin.Context) {
	order, _, err := h.Service.Repo.Get(c.Param("id"), middleware.GetTenantID(c))
	if err != nil || !canViewOrder(c, order) {
		httpx.NotFound(c, "order not found")
		return
	}
	if order.TrackingCarrier == nil && order.TrackingNumber == nil && order.TrackingURL == nil {
		httpx.NotFound(c, "tracking not available")
		return
	}
	httpx.OK(c, gin.H{"order_id": order.ID, "carrier": order.TrackingCarrier, "tracking_number": order.TrackingNumber, "tracking_url": order.TrackingURL, "shipped_at": order.ShippedAt, "status": order.Status})
}

func (h *OrderHandler) SetTracking(c *gin.Context) {
	var body struct {
		Carrier        string `json:"carrier" binding:"required"`
		TrackingNumber string `json:"tracking_number" binding:"required"`
		TrackingURL    string `json:"tracking_url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if err := h.Service.SetTracking(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c), body.Carrier, body.TrackingNumber, body.TrackingURL); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"id": c.Param("id"), "carrier": body.Carrier, "tracking_number": body.TrackingNumber})
}

func (h *OrderHandler) CreateReturn(c *gin.Context) {
	var body struct{ Reason string `json:"reason" binding:"required"` }
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	order, _, err := h.Service.Repo.Get(c.Param("id"), middleware.GetTenantID(c))
	claims := middleware.GetClaims(c)
	if err != nil || claims == nil || order.UserID == nil || *order.UserID != claims.UserID {
		httpx.NotFound(c, "order not found")
		return
	}
	if order.PaymentStatus != "paid" || (order.Status != "shipped" && order.Status != "delivered" && order.Status != "completed") {
		httpx.BadRequest(c, "only paid shipped, delivered, or completed orders can be returned")
		return
	}
	var id string
	err = h.Service.Repo.DB.Get(&id, `INSERT INTO order_returns (tenant_id,order_id,user_id,reason,status) VALUES ($1,$2,$3,$4,'requested') RETURNING id::text`, middleware.GetTenantID(c), order.ID, claims.UserID, body.Reason)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	middleware.WriteAudit(c, "create_return", "order_return", id, nil, gin.H{"order_id": order.ID})
	httpx.Created(c, gin.H{"id": id, "status": "requested"})
}

func (h *OrderHandler) Returns(c *gin.Context) {
	var rows []model.OrderReturn
	order, _, err := h.Service.Repo.Get(c.Param("id"), middleware.GetTenantID(c))
	if err != nil || !canViewOrder(c, order) {
		httpx.NotFound(c, "order not found")
		return
	}
	if err := h.Service.Repo.DB.Select(&rows, `SELECT id::text,tenant_id::text,order_id::text,user_id::text,reason,status,admin_note,created_at,updated_at FROM order_returns WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at DESC`, middleware.GetTenantID(c), order.ID); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": rows})
}

func (h *OrderHandler) AdminReturns(c *gin.Context) {
	var rows []model.OrderReturn
	q := `SELECT id::text,tenant_id::text,order_id::text,user_id::text,reason,status,admin_note,created_at,updated_at FROM order_returns WHERE tenant_id=$1`
	args := []any{middleware.GetTenantID(c)}
	if status := c.Query("status"); status != "" {
		q += ` AND status=$2`
		args = append(args, status)
	}
	if err := h.Service.Repo.DB.Select(&rows, q+` ORDER BY created_at DESC`, args...); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": rows})
}

func (h *OrderHandler) ProcessReturn(c *gin.Context) {
	action := c.Param("action")
	var body struct{ Note string `json:"note"` }
	_ = c.ShouldBindJSON(&body)
	statuses := map[string]string{"approve": "approved", "reject": "rejected", "receive": "received"}
	var ret model.OrderReturn
	if err := h.Service.Repo.DB.Get(&ret, `SELECT id::text,tenant_id::text,order_id::text,user_id::text,reason,status,admin_note,created_at,updated_at FROM order_returns WHERE id=$1 AND tenant_id=$2`, c.Param("id"), middleware.GetTenantID(c)); err != nil {
		httpx.NotFound(c, "return not found")
		return
	}
	if action == "refund" {
		if ret.Status != "received" {
			httpx.BadRequest(c, "return must be received before refund")
			return
		}
		if err := h.Service.Refund(c.Request.Context(), ret.OrderID, ret.TenantID); err != nil {
			httpx.BadRequest(c, err.Error())
			return
		}
		if _, err := h.Service.Repo.DB.Exec(`UPDATE order_returns SET status='refunded',admin_note=COALESCE(NULLIF($1,''),admin_note),updated_at=NOW() WHERE id=$2`, body.Note, ret.ID); err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		_, _ = h.Service.Repo.DB.Exec(`UPDATE orders SET status='returned',updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, ret.OrderID, ret.TenantID)
		middleware.WriteAudit(c, "return_refund", "order_return", ret.ID, gin.H{"status": ret.Status}, gin.H{"status": "refunded"})
		httpx.OK(c, gin.H{"id": ret.ID, "status": "refunded"})
		return
	}
	target, ok := statuses[action]
	if !ok {
		httpx.BadRequest(c, "unknown return action")
		return
	}
	if action == "reject" && body.Note == "" {
		httpx.BadRequest(c, "rejection note required")
		return
	}
	if ((action == "approve" || action == "reject") && ret.Status != "requested") || (action == "receive" && ret.Status != "approved") {
		httpx.BadRequest(c, fmt.Sprintf("cannot %s return in %s state", action, ret.Status))
		return
	}
	if _, err := h.Service.Repo.DB.Exec(`UPDATE order_returns SET status=$1,admin_note=COALESCE(NULLIF($2,''),admin_note),updated_at=NOW() WHERE id=$3`, target, body.Note, ret.ID); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	middleware.WriteAudit(c, "return_"+action, "order_return", ret.ID, gin.H{"status": ret.Status}, gin.H{"status": target})
	httpx.OK(c, gin.H{"id": ret.ID, "status": target})
}
