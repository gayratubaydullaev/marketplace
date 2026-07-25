package handler

import (
	"errors"
	"strconv"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/delivery/internal/service"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	Svc *service.Service
}

func (h *Handler) writeErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrNotFound):
		httpx.NotFound(c, "not found")
	case errors.Is(err, service.ErrForbidden):
		httpx.Forbidden(c, "forbidden")
	case errors.Is(err, service.ErrConflict):
		httpx.Conflict(c, err.Error())
	case errors.Is(err, service.ErrBadRequest), errors.Is(err, service.ErrPaymentPending):
		httpx.BadRequest(c, err.Error())
	default:
		httpx.Internal(c, "internal error")
	}
}

// assertCanAccessOrder mirrors orders/payments ownership. On deny returns 404 to avoid IDOR leaks.
func (h *Handler) assertCanAccessOrder(c *gin.Context, orderID string) bool {
	acc, err := h.Svc.GetOrderAccess(h.tenant(c), orderID)
	if err != nil {
		httpx.NotFound(c, "order not found")
		return false
	}
	cl := h.claims(c)
	if cl == nil {
		guest := c.GetHeader("X-Guest-ID")
		if acc.UserID != nil || guest == "" || acc.GuestID == "" || acc.GuestID != guest {
			httpx.NotFound(c, "order not found")
			return false
		}
		return true
	}
	switch cl.Role {
	case commonauth.RoleTenantAdmin, commonauth.RoleManager, commonauth.RoleSuperAdmin:
		return true
	case commonauth.RoleVendor:
		vid := h.Svc.ResolveVendorID(h.tenant(c), cl.UserID, cl.VendorID)
		if !h.Svc.VendorOwnsOrder(orderID, vid) {
			httpx.NotFound(c, "order not found")
			return false
		}
		return true
	case commonauth.RoleCourier:
		cid := cl.CourierID
		if cid == "" {
			if co, err := h.Svc.CourierByUser(h.tenant(c), cl.UserID); err == nil {
				cid = co.ID
			}
		}
		if !h.Svc.CourierAssignedToOrder(h.tenant(c), orderID, cid, false) {
			httpx.NotFound(c, "order not found")
			return false
		}
		return true
	default:
		if acc.UserID == nil || *acc.UserID != cl.UserID {
			httpx.NotFound(c, "order not found")
			return false
		}
		return true
	}
}

func (h *Handler) assertCanRateOrder(c *gin.Context, orderID string) (customerID string, ok bool) {
	acc, err := h.Svc.GetOrderAccess(h.tenant(c), orderID)
	if err != nil {
		httpx.NotFound(c, "order not found")
		return "", false
	}
	cl := h.claims(c)
	if cl == nil {
		guest := c.GetHeader("X-Guest-ID")
		if acc.UserID != nil || guest == "" || acc.GuestID == "" || acc.GuestID != guest {
			httpx.NotFound(c, "order not found")
			return "", false
		}
		return "", true
	}
	if acc.UserID != nil {
		if *acc.UserID != cl.UserID {
			httpx.Forbidden(c, "only the customer can rate")
			return "", false
		}
		return cl.UserID, true
	}
	guest := c.GetHeader("X-Guest-ID")
	if guest == "" || acc.GuestID == "" || acc.GuestID != guest {
		httpx.Forbidden(c, "only the customer can rate")
		return "", false
	}
	return cl.UserID, true
}

func (h *Handler) tenant(c *gin.Context) string { return middleware.GetTenantID(c) }

func (h *Handler) claims(c *gin.Context) *commonauth.Claims { return middleware.GetClaims(c) }

func (h *Handler) requireCourier(c *gin.Context) (courierID string, ok bool) {
	cl := h.claims(c)
	if cl == nil || cl.Role != commonauth.RoleCourier {
		httpx.Forbidden(c, "courier role required")
		return "", false
	}
	co, err := h.Svc.CourierByUser(h.tenant(c), cl.UserID)
	if err != nil {
		h.writeErr(c, err)
		return "", false
	}
	if co.Status != "active" {
		httpx.Forbidden(c, "courier not active")
		return "", false
	}
	if cl.CourierID != "" && cl.CourierID != co.ID {
		httpx.Forbidden(c, "courier identity mismatch")
		return "", false
	}
	return co.ID, true
}

// Admin

func (h *Handler) AdminListCouriers(c *gin.Context) {
	items, err := h.Svc.ListCouriers(h.tenant(c))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) AdminCreateCourier(c *gin.Context) {
	var in service.CreateCourierInput
	if err := c.ShouldBindJSON(&in); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	co, err := h.Svc.CreateCourier(h.tenant(c), in)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.Created(c, co)
}

func (h *Handler) AdminApproveCourier(c *gin.Context) {
	co, err := h.Svc.SetCourierStatus(h.tenant(c), c.Param("id"), "active")
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, co)
}

func (h *Handler) AdminBlockCourier(c *gin.Context) {
	co, err := h.Svc.SetCourierStatus(h.tenant(c), c.Param("id"), "blocked")
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, co)
}

func (h *Handler) AdminListJobs(c *gin.Context) {
	items, err := h.Svc.ListJobs(h.tenant(c), c.Query("status"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) AdminGetJob(c *gin.Context) {
	job, err := h.Svc.GetJob(h.tenant(c), c.Param("id"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, job)
}

func (h *Handler) AdminAssign(c *gin.Context) {
	var body struct {
		CourierID string `json:"courier_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	cl := h.claims(c)
	actor := ""
	if cl != nil {
		actor = cl.UserID
	}
	job, err := h.Svc.AdminAssign(h.tenant(c), c.Param("id"), body.CourierID, actor)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, job)
}

func (h *Handler) AdminReassign(c *gin.Context) {
	var body struct {
		CourierID string `json:"courier_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	cl := h.claims(c)
	actor := ""
	if cl != nil {
		actor = cl.UserID
	}
	job, err := h.Svc.Reassign(h.tenant(c), c.Param("id"), body.CourierID, actor)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, job)
}

func (h *Handler) AdminRetryAssign(c *gin.Context) {
	job, err := h.Svc.RetryAssign(h.tenant(c), c.Param("id"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, job)
}

func (h *Handler) AdminShifts(c *gin.Context) {
	items, err := h.Svc.AdminShifts(h.tenant(c))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) AdminListMessages(c *gin.Context) {
	items, err := h.Svc.ListMessages(h.tenant(c), c.Param("id"), "tenant_admin", c.Query("thread"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) AdminPostMessage(c *gin.Context) {
	var body struct {
		Body   string `json:"body" binding:"required"`
		ToRole string `json:"to_role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	cl := h.claims(c)
	actor := ""
	role := "tenant_admin"
	if cl != nil {
		actor = cl.UserID
		if cl.Role != "" {
			role = string(cl.Role)
		}
	}
	m, err := h.Svc.PostMessage(h.tenant(c), c.Param("id"), role, actor, body.Body, body.ToRole)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.Created(c, m)
}

func (h *Handler) AdminListRatings(c *gin.Context) {
	items, err := h.Svc.ListRatings(h.tenant(c))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) AdminCreatePayout(c *gin.Context) {
	var body struct {
		CourierID   string `json:"courier_id" binding:"required"`
		PeriodStart string `json:"period_start" binding:"required"`
		PeriodEnd   string `json:"period_end" binding:"required"`
		Note        string `json:"note"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	p, err := h.Svc.CreatePayout(h.tenant(c), body.CourierID, body.PeriodStart, body.PeriodEnd, body.Note)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.Created(c, p)
}

func (h *Handler) AdminListPayouts(c *gin.Context) {
	items, err := h.Svc.ListPayouts(h.tenant(c), c.Query("courier_id"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) AdminMarkPayoutPaid(c *gin.Context) {
	p, err := h.Svc.MarkPayoutPaid(h.tenant(c), c.Param("id"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, p)
}

// Vendor / shared delivery

func (h *Handler) ReadyForDelivery(c *gin.Context) {
	cl := h.claims(c)
	if cl == nil {
		httpx.Unauthorized(c, "auth required")
		return
	}
	orderID := c.Param("id")
	if orderID == "" {
		var body struct {
			OrderID string `json:"order_id"`
		}
		_ = c.ShouldBindJSON(&body)
		orderID = body.OrderID
	}
	if orderID == "" {
		httpx.BadRequest(c, "order_id required")
		return
	}
	vendorID := cl.VendorID
	job, err := h.Svc.ReadyForDelivery(h.tenant(c), orderID, vendorID, string(cl.Role), cl.UserID)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, job)
}

func (h *Handler) GetJobByOrder(c *gin.Context) {
	orderID := h.orderIDParam(c)
	if !h.assertCanAccessOrder(c, orderID) {
		return
	}
	job, err := h.Svc.GetJobByOrder(h.tenant(c), orderID)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, job)
}

func (h *Handler) LiveByOrder(c *gin.Context) {
	orderID := h.orderIDParam(c)
	if !h.assertCanAccessOrder(c, orderID) {
		return
	}
	live, err := h.Svc.LiveByOrder(h.tenant(c), orderID)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, live)
}

func (h *Handler) GeoSearch(c *gin.Context) {
	q := c.Query("q")
	limit := 5
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	items, err := h.Svc.GeoSearch(c.Request.Context(), c.ClientIP(), q, limit)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) GeoReverse(c *gin.Context) {
	lat, err1 := strconv.ParseFloat(c.Query("lat"), 64)
	lng, err2 := strconv.ParseFloat(c.Query("lng"), 64)
	if err1 != nil || err2 != nil {
		httpx.BadRequest(c, "lat and lng required")
		return
	}
	item, err := h.Svc.GeoReverse(c.Request.Context(), c.ClientIP(), lat, lng)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, item)
}

func (h *Handler) orderIDParam(c *gin.Context) string {
	if id := c.Param("id"); id != "" {
		return id
	}
	return c.Param("order_id")
}

func (h *Handler) RateByOrder(c *gin.Context) {
	var body struct {
		Score   int    `json:"score" binding:"required"`
		Comment string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	orderID := h.orderIDParam(c)
	customerID, ok := h.assertCanRateOrder(c, orderID)
	if !ok {
		return
	}
	r, err := h.Svc.RateCourier(h.tenant(c), orderID, customerID, body.Score, body.Comment)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, r)
}

func (h *Handler) OrderMessagesList(c *gin.Context) {
	orderID := h.orderIDParam(c)
	if !h.assertCanAccessOrder(c, orderID) {
		return
	}
	job, err := h.Svc.GetJobByOrder(h.tenant(c), orderID)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	viewer := "customer"
	if cl := h.claims(c); cl != nil {
		viewer = string(cl.Role)
	}
	items, err := h.Svc.ListMessages(h.tenant(c), job.ID, viewer, "")
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items, "job_id": job.ID})
}

func (h *Handler) OrderMessagesPost(c *gin.Context) {
	var body struct {
		Body   string `json:"body" binding:"required"`
		ToRole string `json:"to_role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	orderID := h.orderIDParam(c)
	if !h.assertCanAccessOrder(c, orderID) {
		return
	}
	job, err := h.Svc.GetJobByOrder(h.tenant(c), orderID)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	cl := h.claims(c)
	role, sender := "customer", ""
	if cl != nil {
		role = string(cl.Role)
		sender = cl.UserID
	}
	// Customers always write into the courier thread (never broadcast / vendor).
	toRole := body.ToRole
	if role == "customer" || role == "" {
		toRole = "courier"
	}
	if role == "vendor" && (toRole == "" || toRole == "all") {
		toRole = "courier"
	}
	m, err := h.Svc.PostMessage(h.tenant(c), job.ID, role, sender, body.Body, toRole)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.Created(c, m)
}

// Courier app

func (h *Handler) Me(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	co, err := h.Svc.GetCourier(h.tenant(c), cid)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	sh, _ := h.Svc.CurrentShift(h.tenant(c), cid)
	earn, _ := h.Svc.CourierEarnings(h.tenant(c), cid)
	httpx.OK(c, gin.H{"courier": co, "shift": sh, "earnings": earn})
}

func (h *Handler) UpdateMe(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	var body struct {
		Phone       string `json:"phone"`
		VehicleType string `json:"vehicle_type"`
		FullName    string `json:"full_name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	co, err := h.Svc.UpdateCourierSelf(h.tenant(c), cid, body.Phone, body.VehicleType, body.FullName)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"courier": co})
}

func (h *Handler) Location(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	var body struct {
		Lat float64 `json:"lat" binding:"required"`
		Lng float64 `json:"lng" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if err := h.Svc.UpdateLocation(h.tenant(c), cid, body.Lat, body.Lng); err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"ok": true})
}

func (h *Handler) OpenShift(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	sh, err := h.Svc.OpenShift(h.tenant(c), cid)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, sh)
}

func (h *Handler) CloseShift(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	if err := h.Svc.CloseShift(h.tenant(c), cid); err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"ok": true})
}

func (h *Handler) CourierJobs(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	scope := c.DefaultQuery("scope", "active")
	items, err := h.Svc.ListCourierJobs(h.tenant(c), cid, scope)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items, "scope": scope})
}

func (h *Handler) CourierJob(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	job, err := h.Svc.GetJob(h.tenant(c), c.Param("id"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	if job.CourierID == nil || *job.CourierID != cid {
		httpx.Forbidden(c, "not your job")
		return
	}
	httpx.OK(c, job)
}

func (h *Handler) CourierJobAction(c *gin.Context) {
	h.runJobAction(c, c.Param("action"))
}

func (h *Handler) CourierJobActionFixed(action string) gin.HandlerFunc {
	return func(c *gin.Context) { h.runJobAction(c, action) }
}

func (h *Handler) runJobAction(c *gin.Context, action string) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	cl := h.claims(c)
	auth := c.GetHeader("Authorization")
	job, err := h.Svc.TransitionJob(c.Request.Context(), h.tenant(c), c.Param("id"), cid, action, string(cl.Role), cl.UserID, auth)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, job)
}

func (h *Handler) CourierCollectCOD(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	if err := h.Svc.CollectCODProxy(c.Request.Context(), h.tenant(c), c.Param("id"), cid, c.GetHeader("Authorization")); err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"ok": true})
}

func (h *Handler) CourierRoute(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	items, err := h.Svc.CourierRoute(h.tenant(c), cid)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"stops": items})
}

func (h *Handler) CourierMessagesList(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	job, err := h.Svc.GetJob(h.tenant(c), c.Param("id"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	if job.CourierID == nil || *job.CourierID != cid {
		httpx.Forbidden(c, "not your job")
		return
	}
	items, err := h.Svc.ListMessages(h.tenant(c), job.ID, "courier", c.Query("thread"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) CourierMessagesPost(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	var body struct {
		Body   string `json:"body" binding:"required"`
		ToRole string `json:"to_role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	job, err := h.Svc.GetJob(h.tenant(c), c.Param("id"))
	if err != nil {
		h.writeErr(c, err)
		return
	}
	if job.CourierID == nil || *job.CourierID != cid {
		httpx.Forbidden(c, "not your job")
		return
	}
	toRole := body.ToRole
	if toRole == "" || toRole == "all" {
		toRole = "customer"
	}
	if toRole != "customer" && toRole != "vendor" && toRole != "tenant_admin" {
		httpx.BadRequest(c, "to_role must be customer, vendor, or tenant_admin")
		return
	}
	cl := h.claims(c)
	m, err := h.Svc.PostMessage(h.tenant(c), job.ID, "courier", cl.UserID, body.Body, toRole)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.Created(c, m)
}

func (h *Handler) CourierPayouts(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	items, err := h.Svc.ListPayouts(h.tenant(c), cid)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) CourierEarnings(c *gin.Context) {
	cid, ok := h.requireCourier(c)
	if !ok {
		return
	}
	sum, err := h.Svc.CourierEarnings(h.tenant(c), cid)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	payouts, _ := h.Svc.ListPayouts(h.tenant(c), cid)
	recent, _ := h.Svc.ListCourierJobs(h.tenant(c), cid, "history")
	if len(recent) > 20 {
		recent = recent[:20]
	}
	httpx.OK(c, gin.H{"summary": sum, "payouts": payouts, "recent_jobs": recent})
}

// Orders ready-for-delivery mounted on orders service path via gateway rewrite — also exposed here.
func (h *Handler) ReadyForDeliveryOrdersPath(c *gin.Context) {
	h.ReadyForDelivery(c)
}
