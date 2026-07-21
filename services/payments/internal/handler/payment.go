package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/payments/internal/model"
	"github.com/gayrat/marketplace/services/payments/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type PaymentHandler struct {
	Service   *service.PaymentService
	Providers map[string]service.Provider
	Sandbox   bool
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func (h *PaymentHandler) ProvidersList(c *gin.Context) {
	httpx.OK(c, gin.H{"providers": []string{"payme", "click", "uzum", "stripe", "paypal", "bank_transfer"}, "currency": "UZS", "sandbox": h.Sandbox})
}

func (h *PaymentHandler) Intent(c *gin.Context) {
	var body struct {
		OrderID        string `json:"order_id" binding:"required"`
		Provider       string `json:"provider" binding:"required"`
		IdempotencyKey string `json:"idempotency_key"`
		Metadata       map[string]any `json:"metadata"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	provider, ok := h.Providers[body.Provider]
	if !ok {
		httpx.BadRequest(c, "unsupported provider")
		return
	}
	tenantID := middleware.GetTenantID(c)
	if body.IdempotencyKey != "" {
		var id string
		if h.Service.Repo.DB.Get(&id, `SELECT id FROM payments WHERE tenant_id=$1 AND idempotency_key=$2`, tenantID, body.IdempotencyKey) == nil {
			var meta []byte
			_ = h.Service.Repo.DB.Get(&meta, `SELECT metadata FROM payments WHERE id=$1`, id)
			var m map[string]any
			_ = json.Unmarshal(meta, &m)
			redirect, _ := m["redirect_url"].(string)
			httpx.OK(c, gin.H{"id": id, "idempotent": true, "redirect_url": redirect})
			return
		}
	}
	var order struct {
		Total         float64 `db:"total"`
		PaymentStatus string  `db:"payment_status"`
	}
	if err := h.Service.Repo.DB.Get(&order, `SELECT total,COALESCE(payment_status,'unpaid') payment_status FROM orders WHERE id=$1 AND tenant_id=$2`, body.OrderID, tenantID); err != nil {
		httpx.NotFound(c, "order not found")
		return
	}
	if order.PaymentStatus == "paid" {
		httpx.Conflict(c, "order already paid")
		return
	}
	providerID, redirect, err := provider.CreateIntent(order.Total, "UZS", body.OrderID)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	var userID *string
	if claims := middleware.GetClaims(c); claims != nil {
		userID = &claims.UserID
	}
	var idem *string
	if body.IdempotencyKey != "" {
		idem = &body.IdempotencyKey
	}
	id := uuid.NewString()
	publicBase := os.Getenv("PAYMENTS_PUBLIC_BASE")
	if publicBase == "" {
		publicBase = "http://localhost:8006"
	}
	storefront := os.Getenv("NEXT_PUBLIC_STOREFRONT_URL")
	if storefront == "" {
		storefront = "http://localhost:3000"
	}
	sandboxRedirect := fmt.Sprintf("%s/v1/payments/sandbox/pay/%s?return_url=%s/uz/orders/%s/payment-return", publicBase, id, storefront, body.OrderID)
	if !h.Sandbox && redirect != "" {
		sandboxRedirect = redirect
	}
	metaValues := gin.H{"redirect_url": sandboxRedirect, "sandbox": h.Sandbox}
	for key, value := range body.Metadata {
		metaValues[key] = value
	}
	if accountID := service.StripeConnectAccountID(body.Metadata); accountID != "" {
		metaValues["stripe_connected_account_id"] = accountID
	}
	meta := mustJSON(metaValues)
	if _, err = h.Service.Repo.DB.Exec(`INSERT INTO payments (id,tenant_id,order_id,user_id,amount,currency,provider,provider_payment_id,status,idempotency_key,metadata) VALUES ($1,$2,$3,$4,$5,'UZS',$6,$7,'pending',$8,$9)`, id, tenantID, body.OrderID, userID, order.Total, body.Provider, providerID, idem, meta); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.Created(c, gin.H{"id": id, "provider": body.Provider, "provider_payment_id": providerID, "amount": order.Total, "currency": "UZS", "redirect_url": sandboxRedirect, "sandbox": h.Sandbox})
}

func (h *PaymentHandler) Confirm(c *gin.Context) {
	var body struct {
		PaymentID    string `json:"payment_id" binding:"required"`
		SandboxForce bool   `json:"sandbox_force"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	payment, err := h.Service.Repo.Find(body.PaymentID)
	if err != nil {
		httpx.NotFound(c, "payment not found")
		return
	}
	if payment.Status == "succeeded" {
		httpx.OK(c, gin.H{"status": "succeeded", "order_id": payment.OrderID})
		return
	}
	if !h.Sandbox || !body.SandboxForce {
		httpx.BadRequest(c, "await webhook confirmation; set sandbox_force=true only in PAYMENTS_SANDBOX for internal e2e")
		return
	}
	if err := h.Service.MarkPaid(c.Request.Context(), payment); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"status": "succeeded", "order_id": payment.OrderID})
}

func (h *PaymentHandler) Webhook(c *gin.Context) {
	provider, ok := h.Providers[c.Param("provider")]
	if !ok {
		httpx.BadRequest(c, "unknown provider")
		return
	}
	payload, _ := io.ReadAll(c.Request.Body)
	credential := c.GetHeader("X-Signature")
	if c.Param("provider") == "stripe" {
		credential = c.GetHeader("Stripe-Signature")
	} else if auth := c.GetHeader("Authorization"); auth != "" {
		credential = auth
	} else if auth := c.GetHeader("X-Auth"); auth != "" {
		credential = auth
	}
	providerID, status, err := provider.VerifyWebhook(payload, credential)
	if err != nil {
		httpx.Unauthorized(c, err.Error())
		return
	}
	payment, err := h.Service.Repo.FindByProviderID(providerID)
	if err != nil {
		httpx.OK(c, gin.H{"received": true, "matched": false})
		return
	}
	if status == "succeeded" {
		if err := h.Service.MarkPaid(c.Request.Context(), payment); err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		httpx.OK(c, gin.H{"status": "succeeded", "order_id": payment.OrderID})
		return
	}
	_, _ = h.Service.Repo.DB.Exec(`UPDATE payments SET status=$1,updated_at=NOW() WHERE id=$2`, status, payment.ID)
	httpx.OK(c, gin.H{"received": true, "status": status})
}

func (h *PaymentHandler) List(c *gin.Context) {
	items, err := h.Service.Repo.ListForOrder(c.Param("order_id"))
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

// SandboxPayPage renders a provider-shaped pay page; POST confirms via webhook path.
func (h *PaymentHandler) SandboxPayPage(c *gin.Context) {
	if !h.Sandbox {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusForbidden, `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem"><h1>Sandbox disabled</h1><p>PAYMENTS_SANDBOX is false.</p></body></html>`)
		return
	}
	payment, err := h.Service.Repo.Find(c.Param("id"))
	if err != nil {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusNotFound, `<!DOCTYPE html><html><body style="font-family:system-ui;max-width:420px;margin:4rem auto;padding:1rem">
<div style="border:1px solid #e7e5e4;border-radius:12px;padding:1.5rem">
<h1>Payment not found</h1>
<p style="color:#78716c">This sandbox payment link is invalid or expired. Return to the storefront and try checkout again.</p>
</div></body></html>`)
		return
	}
	returnURL := c.Query("return_url")
	if c.Request.Method == http.MethodPost {
		if payment.Status == "succeeded" {
			if returnURL != "" {
				c.Redirect(http.StatusFound, returnURL)
				return
			}
			httpx.OK(c, gin.H{"status": "succeeded", "order_id": payment.OrderID})
			return
		}
		if err := h.Service.MarkPaid(c.Request.Context(), payment); err != nil {
			c.Header("Content-Type", "text/html; charset=utf-8")
			c.String(http.StatusInternalServerError, "<!DOCTYPE html><html><body><h1>Payment failed</h1><p>%s</p></body></html>", err.Error())
			return
		}
		if returnURL != "" {
			c.Redirect(http.StatusFound, returnURL)
			return
		}
		httpx.OK(c, gin.H{"status": "succeeded", "order_id": payment.OrderID})
		return
	}
	c.Header("Content-Type", "text/html; charset=utf-8")
	_, _ = c.Writer.Write([]byte(fmt.Sprintf(`<!DOCTYPE html><html><head><title>Sandbox %s</title>
<style>body{font-family:system-ui;max-width:420px;margin:4rem auto;padding:1rem}
button{background:#0f766e;color:#fff;border:0;padding:.75rem 1.25rem;border-radius:8px;font-size:1rem;cursor:pointer;width:100%%}
.card{border:1px solid #e7e5e4;border-radius:12px;padding:1.5rem}</style></head>
<body><div class="card"><h1>Sandbox %s</h1>
<p>Order: %s</p><p>Amount: %.0f UZS</p><p>Payment: %s</p>
<form method="POST"><button type="submit">Pay (sandbox)</button></form>
<p style="color:#78716c;font-size:.85rem;margin-top:1rem">Simulates provider redirect + webhook confirmation. No live money.</p>
</div></body></html>`, payment.Provider, payment.Provider, payment.OrderID, payment.Amount, payment.ID)))
}

func (h *PaymentHandler) GetStatus(c *gin.Context) {
	payment, err := h.Service.Repo.Find(c.Param("id"))
	if err != nil {
		httpx.NotFound(c, "payment not found")
		return
	}
	httpx.OK(c, gin.H{"id": payment.ID, "status": payment.Status, "order_id": payment.OrderID, "provider": payment.Provider, "amount": payment.Amount})
}

var _ = model.Payment{}
