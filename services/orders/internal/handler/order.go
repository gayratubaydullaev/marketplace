package handler

import (
	"encoding/json"
	"fmt"
	"strings"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/orders/internal/model"
	"github.com/gayrat/marketplace/services/orders/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

type OrderHandler struct{ Service *service.OrderService }

func (h *OrderHandler) Create(c *gin.Context) {
	var body struct {
		CartID          string          `json:"cart_id"`
		GuestEmail      string          `json:"guest_email"`
		PaymentMethod   string          `json:"payment_method"`
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
		GuestEmail:      strings.TrimSpace(body.GuestEmail),
		PaymentMethod:   body.PaymentMethod,
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
		err := db.WithTenant(h.Service.Repo.DB, middleware.GetTenantID(c), func(tx *sqlx.Tx) error {
			return tx.QueryRow(`SELECT jsonb_build_object('region',region,'district',district,'mahalla',mahalla,'street',street,'building',building,'apartment',apartment,'phone',phone,'full_name',full_name) FROM addresses WHERE id=$1 AND user_id=$2 AND tenant_id=$3`, body.AddressID, claims.UserID, middleware.GetTenantID(c)).Scan(&address)
		})
		if err == nil {
			input.ShippingAddress = address
		}
	}
	result, err := h.Service.Create(c.Request.Context(), input)
	if err != nil {
		msg, bad := service.ClassifyCreateError(err)
		if bad {
			httpx.BadRequest(c, msg)
			return
		}
		if httpx.IsInvalidUUID(err) {
			httpx.BadRequest(c, "invalid id")
			return
		}
		httpx.Internal(c, msg)
		return
	}
	httpx.Created(c, result)
}

func (h *OrderHandler) List(c *gin.Context) {
	claims := middleware.GetClaims(c)
	tenantID := middleware.GetTenantID(c)
	if claims == nil {
		guestID := c.GetHeader("X-Guest-ID")
		if guestID == "" {
			httpx.OK(c, gin.H{"items": []model.Order{}})
			return
		}
		orders, err := h.Service.Repo.ListByGuest(tenantID, guestID)
		if err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		if orders == nil {
			orders = []model.Order{}
		}
		httpx.OK(c, gin.H{"items": orders})
		return
	}

	var (
		orders []model.Order
		err    error
	)
	switch claims.Role {
	case commonauth.RoleTenantAdmin, commonauth.RoleSuperAdmin, commonauth.RoleManager, commonauth.RoleModerator:
		orders, err = h.Service.Repo.List(tenantID, claims.UserID, false)
	case commonauth.RoleVendor:
		vendorID := claims.VendorID
		if vendorID == "" {
			_ = h.Service.Repo.DB.Get(&vendorID, `SELECT id::text FROM vendors WHERE user_id=$1 AND tenant_id=$2 ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`, claims.UserID, tenantID)
		}
		if vendorID == "" {
			httpx.OK(c, gin.H{"items": []model.Order{}})
			return
		}
		orders, err = h.Service.Repo.ListByVendor(tenantID, vendorID)
	case commonauth.RoleCourier:
		courierID := claims.CourierID
		if courierID == "" {
			httpx.OK(c, gin.H{"items": []model.Order{}})
			return
		}
		orders, err = h.Service.Repo.ListByCourier(tenantID, courierID)
	case commonauth.RoleCustomer:
		orders, err = h.Service.Repo.List(tenantID, claims.UserID, true)
	default:
		httpx.Forbidden(c, "insufficient permissions")
		return
	}
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if orders == nil {
		orders = []model.Order{}
	}
	httpx.OK(c, gin.H{"items": orders})
}

func digitsOnly(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Lookup lets guests find an order by order_number + phone (no account required).
func (h *OrderHandler) Lookup(c *gin.Context) {
	var body struct {
		OrderNumber string `json:"order_number" binding:"required"`
		Phone       string `json:"phone" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	number := strings.TrimSpace(body.OrderNumber)
	phoneDigits := digitsOnly(body.Phone)
	if number == "" || len(phoneDigits) < 12 {
		// Require full UZ numbers (+998XXXXXXXXX → 12 digits) to reduce guessing.
		httpx.BadRequest(c, "order_number and full phone required")
		return
	}
	order, items, err := h.Service.Repo.GetByNumber(number, middleware.GetTenantID(c))
	if err != nil {
		httpx.NotFound(c, "order not found")
		return
	}
	var addr map[string]any
	_ = json.Unmarshal(order.ShippingAddress, &addr)
	storedPhone, _ := addr["phone"].(string)
	storedDigits := digitsOnly(storedPhone)
	ok := storedDigits != "" && storedDigits == phoneDigits
	if !ok && len(storedDigits) >= 12 && len(phoneDigits) >= 12 {
		ok = storedDigits[len(storedDigits)-12:] == phoneDigits[len(phoneDigits)-12:]
	}
	if !ok {
		httpx.NotFound(c, "order not found")
		return
	}
	// Bind guest session only when none is set yet — never overwrite (prevents takeover).
	if guestID := strings.TrimSpace(c.GetHeader("X-Guest-ID")); guestID != "" && order.UserID == nil {
		_, _ = h.Service.Repo.DB.Exec(`
			UPDATE orders SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('guest_id', $1::text), updated_at=NOW()
			WHERE id=$2 AND tenant_id=$3 AND user_id IS NULL
			  AND COALESCE(metadata->>'guest_id','') = ''`, guestID, order.ID, order.TenantID)
	}
	if items == nil {
		items = []model.OrderItem{}
	}
	// Minimal public payload — full details via Get after guest binding.
	httpx.OK(c, gin.H{
		"order": gin.H{
			"id":             order.ID,
			"order_number":   order.OrderNumber,
			"status":         order.Status,
			"payment_status": order.PaymentStatus,
			"created_at":     order.CreatedAt,
			"total":          order.Total,
			"currency":       order.Currency,
		},
		"items": items,
	})
}

func (h *OrderHandler) Get(c *gin.Context) {
	order, items, err := h.Service.Repo.Get(c.Param("id"), middleware.GetTenantID(c))
	if err != nil {
		httpx.NotFound(c, "order not found")
		return
	}
	if !h.canViewOrder(c, order) {
		httpx.NotFound(c, "order not found")
		return
	}
	if items == nil {
		items = []model.OrderItem{}
	}
	httpx.OK(c, gin.H{"order": order, "items": items})
}

func (h *OrderHandler) guestOwnsOrder(orderID, guestID string) bool {
	if guestID == "" {
		return false
	}
	var stored string
	if err := h.Service.Repo.DB.Get(&stored, `SELECT COALESCE(metadata->>'guest_id','') FROM orders WHERE id=$1`, orderID); err != nil {
		return false
	}
	return stored != "" && stored == guestID
}

func (h *OrderHandler) vendorOwnsOrder(orderID, vendorID string) bool {
	if vendorID == "" {
		return false
	}
	var n int
	if err := h.Service.Repo.DB.Get(&n, `SELECT COUNT(1) FROM order_items WHERE order_id=$1 AND vendor_id::text=$2`, orderID, vendorID); err != nil {
		return false
	}
	return n > 0
}

func (h *OrderHandler) canViewOrder(c *gin.Context, order model.Order) bool {
	claims := middleware.GetClaims(c)
	if claims == nil {
		if order.UserID != nil {
			return false
		}
		return h.guestOwnsOrder(order.ID, c.GetHeader("X-Guest-ID"))
	}
	switch claims.Role {
	case commonauth.RoleTenantAdmin, commonauth.RoleManager, commonauth.RoleSuperAdmin, commonauth.RoleModerator:
		return true
	case commonauth.RoleVendor:
		vendorID := claims.VendorID
		if vendorID == "" {
			_ = h.Service.Repo.DB.Get(&vendorID, `SELECT id::text FROM vendors WHERE user_id=$1 AND tenant_id=$2 ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`, claims.UserID, order.TenantID)
		}
		return h.vendorOwnsOrder(order.ID, vendorID)
	case commonauth.RoleCourier:
		if claims.CourierID == "" {
			return false
		}
		var n int
		if err := h.Service.Repo.DB.Get(&n, `
			SELECT COUNT(1) FROM delivery_jobs
			WHERE order_id=$1 AND tenant_id=$2 AND courier_id::text=$3
			  AND status IN ('assigned','accepted','at_pickup','picked_up','in_transit')`,
			order.ID, order.TenantID, claims.CourierID); err != nil {
			return false
		}
		return n > 0
	default:
		return order.UserID != nil && *order.UserID == claims.UserID
	}
}

func (h *OrderHandler) canMutateOrder(c *gin.Context, order model.Order) bool {
	claims := middleware.GetClaims(c)
	if claims == nil {
		return false
	}
	switch claims.Role {
	case commonauth.RoleTenantAdmin, commonauth.RoleManager:
		return true
	case commonauth.RoleVendor:
		vendorID := claims.VendorID
		if vendorID == "" {
			_ = h.Service.Repo.DB.Get(&vendorID, `SELECT id::text FROM vendors WHERE user_id=$1 AND tenant_id=$2 ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`, claims.UserID, order.TenantID)
		}
		return h.vendorOwnsOrder(order.ID, vendorID)
	default:
		return false
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
	order, _, err := h.Service.Repo.Get(c.Param("id"), middleware.GetTenantID(c))
	if err != nil || !h.canMutateOrder(c, order) {
		httpx.NotFound(c, "order not found")
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
	if err != nil || !h.canViewOrder(c, order) {
		httpx.NotFound(c, "order not found")
		return
	}
	if order.TrackingCarrier == nil && order.TrackingNumber == nil && order.TrackingURL == nil {
		httpx.OK(c, gin.H{"order_id": order.ID, "carrier": nil, "tracking_number": nil, "tracking_url": nil, "shipped_at": nil, "status": order.Status, "available": false})
		return
	}
	httpx.OK(c, gin.H{"order_id": order.ID, "carrier": order.TrackingCarrier, "tracking_number": order.TrackingNumber, "tracking_url": order.TrackingURL, "shipped_at": order.ShippedAt, "status": order.Status, "available": true})
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
	order, _, err := h.Service.Repo.Get(c.Param("id"), middleware.GetTenantID(c))
	if err != nil || !h.canMutateOrder(c, order) {
		httpx.NotFound(c, "order not found")
		return
	}
	if err := h.Service.SetTracking(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c), body.Carrier, body.TrackingNumber, body.TrackingURL); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"id": c.Param("id"), "carrier": body.Carrier, "tracking_number": body.TrackingNumber})
}

func (h *OrderHandler) CreateReturn(c *gin.Context) {
	var body struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	tenantID := middleware.GetTenantID(c)
	order, _, err := h.Service.Repo.Get(c.Param("id"), tenantID)
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
	err = db.WithTenant(h.Service.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&id, `INSERT INTO order_returns (tenant_id,order_id,user_id,reason,status) VALUES ($1,$2,$3,$4,'requested') RETURNING id::text`, tenantID, order.ID, claims.UserID, body.Reason)
	})
	if err != nil {
		httpx.WriteDBError(c, err)
		return
	}
	middleware.WriteAudit(c, "create_return", "order_return", id, nil, gin.H{"order_id": order.ID})
	httpx.Created(c, gin.H{"id": id, "status": "requested"})
}

func (h *OrderHandler) Returns(c *gin.Context) {
	var rows []model.OrderReturn
	tenantID := middleware.GetTenantID(c)
	order, _, err := h.Service.Repo.Get(c.Param("id"), tenantID)
	if err != nil || !h.canViewOrder(c, order) {
		httpx.NotFound(c, "order not found")
		return
	}
	err = db.WithTenant(h.Service.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&rows, `SELECT id::text,tenant_id::text,order_id::text,user_id::text,reason,status,admin_note,created_at,updated_at FROM order_returns WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at DESC`, tenantID, order.ID)
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": rows})
}

func (h *OrderHandler) AdminReturns(c *gin.Context) {
	var rows []model.OrderReturn
	tenantID := middleware.GetTenantID(c)
	q := `SELECT id::text,tenant_id::text,order_id::text,user_id::text,reason,status,admin_note,created_at,updated_at FROM order_returns WHERE tenant_id=$1`
	args := []any{tenantID}
	if status := c.Query("status"); status != "" {
		q += ` AND status=$2`
		args = append(args, status)
	}
	err := db.WithTenant(h.Service.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&rows, q+` ORDER BY created_at DESC`, args...)
	})
	if err != nil {
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
	tenantID := middleware.GetTenantID(c)
	var ret model.OrderReturn
	err := db.WithTenant(h.Service.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&ret, `SELECT id::text,tenant_id::text,order_id::text,user_id::text,reason,status,admin_note,created_at,updated_at FROM order_returns WHERE id=$1 AND tenant_id=$2`, c.Param("id"), tenantID)
	})
	if err != nil {
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
		_ = db.WithTenant(h.Service.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
			if _, err := tx.Exec(`UPDATE order_returns SET status='refunded',admin_note=COALESCE(NULLIF($1,''),admin_note),updated_at=NOW() WHERE id=$2`, body.Note, ret.ID); err != nil {
				return err
			}
			_, err := tx.Exec(`UPDATE orders SET status='returned',updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, ret.OrderID, ret.TenantID)
			return err
		})
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
	err = db.WithTenant(h.Service.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(`UPDATE order_returns SET status=$1,admin_note=COALESCE(NULLIF($2,''),admin_note),updated_at=NOW() WHERE id=$3`, target, body.Note, ret.ID)
		return err
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	middleware.WriteAudit(c, "return_"+action, "order_return", ret.ID, gin.H{"status": ret.Status}, gin.H{"status": target})
	httpx.OK(c, gin.H{"id": ret.ID, "status": target})
}
