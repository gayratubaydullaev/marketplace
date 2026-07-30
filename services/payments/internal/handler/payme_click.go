package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/payments/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

func (h *PaymentHandler) paymeMerchantAPI(c *gin.Context) {
	payload, _ := io.ReadAll(c.Request.Body)
	credential := c.GetHeader("Authorization")
	p, ok := h.Providers["payme"].(service.PaymeProvider)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"error": gin.H{"code": -32400, "message": "Payme not configured"}})
		return
	}
	if !service.Sandbox() && !service.VerifyPaymeAuth(credential, p.Secret) {
		c.JSON(http.StatusOK, gin.H{"error": gin.H{"code": -32504, "message": "Unauthorized"}, "id": nil})
		return
	}
	rpc, err := service.ParsePaymeRPC(payload)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"error": gin.H{"code": -32600, "message": "Invalid Request"}, "id": nil})
		return
	}

	switch rpc.Method {
	case "CheckPerformTransaction":
		key := service.PaymeAccountOrderID(rpc.Params)
		payment, err := h.Service.Repo.FindPaymeAccount(key)
		if err != nil || payment.Status == "succeeded" {
			c.JSON(http.StatusOK, gin.H{"error": gin.H{"code": -31050, "message": gin.H{"ru": "Заказ не найден"}}, "id": rpc.ID})
			return
		}
		amount := int64(payment.Amount * 100)
		if want := int64(asFloat(rpc.Params["amount"])); want > 0 && want != amount {
			c.JSON(http.StatusOK, gin.H{"error": gin.H{"code": -31001, "message": "Invalid amount"}, "id": rpc.ID})
			return
		}
		c.JSON(http.StatusOK, gin.H{"result": gin.H{"allow": true}, "id": rpc.ID})
	case "CreateTransaction":
		key := service.PaymeAccountOrderID(rpc.Params)
		payment, err := h.Service.Repo.FindPaymeAccount(key)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"error": gin.H{"code": -31050, "message": "Order not found"}, "id": rpc.ID})
			return
		}
		paymeID := service.PaymeTransactionID(rpc.Params)
		if paymeID != "" {
			_ = db.WithTenant(h.Service.Repo.DB, payment.TenantID, func(tx *sqlx.Tx) error {
				_, err := tx.Exec(`UPDATE payments SET provider_payment_id=$1, updated_at=NOW() WHERE id=$2`, paymeID, payment.ID)
				return err
			})
		}
		c.JSON(http.StatusOK, gin.H{
			"result": gin.H{"create_time": service.NowMS(), "transaction": payment.ID, "state": 1},
			"id":     rpc.ID,
		})
	case "PerformTransaction":
		key := service.PaymeAccountOrderID(rpc.Params)
		paymeID := service.PaymeTransactionID(rpc.Params)
		payment, err := h.Service.Repo.FindPaymeAccount(firstNonEmpty(key, paymeID))
		if err != nil && paymeID != "" {
			payment, err = h.Service.Repo.FindByProviderID(paymeID)
		}
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"error": gin.H{"code": -31003, "message": "Transaction not found"}, "id": rpc.ID})
			return
		}
		if payment.Status != "succeeded" {
			if err := h.Service.MarkPaid(c.Request.Context(), payment); err != nil {
				c.JSON(http.StatusOK, gin.H{"error": gin.H{"code": -31008, "message": err.Error()}, "id": rpc.ID})
				return
			}
			middleware.WriteAudit(c, "mark_paid", "payment", payment.ID, nil, gin.H{"order_id": payment.OrderID, "provider": "payme"})
		}
		c.JSON(http.StatusOK, gin.H{
			"result": gin.H{"transaction": payment.ID, "perform_time": service.NowMS(), "state": 2},
			"id":     rpc.ID,
		})
	case "CheckTransaction", "CancelTransaction", "GetStatement":
		c.JSON(http.StatusOK, gin.H{"result": gin.H{"state": 2, "transaction": ""}, "id": rpc.ID})
	default:
		c.JSON(http.StatusOK, gin.H{"error": gin.H{"code": -32601, "message": "Method not found"}, "id": rpc.ID})
	}
}

func (h *PaymentHandler) clickCallback(c *gin.Context) {
	payload, _ := io.ReadAll(c.Request.Body)
	if len(payload) == 0 {
		_ = c.Request.ParseForm()
		payload = []byte(c.Request.PostForm.Encode())
	}
	p, ok := h.Providers["click"].(service.ClickProvider)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"error": -1, "error_note": "click not configured"})
		return
	}
	merchantID, status, err := service.ParseClickForm(payload, p.Secret)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"error": -1, "error_note": err.Error()})
		return
	}
	payment, err := h.Service.Repo.FindClickMerchant(merchantID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"error": -5, "error_note": "payment not found"})
		return
	}
	if status == "succeeded" && payment.Status != "succeeded" {
		if err := h.Service.MarkPaid(c.Request.Context(), payment); err != nil {
			c.JSON(http.StatusOK, gin.H{"error": -9, "error_note": err.Error()})
			return
		}
		middleware.WriteAudit(c, "mark_paid", "payment", payment.ID, nil, gin.H{"order_id": payment.OrderID, "provider": "click"})
	}
	c.JSON(http.StatusOK, gin.H{
		"click_trans_id":      0,
		"merchant_trans_id":   payment.ProviderPaymentID,
		"merchant_prepare_id": payment.ID,
		"error":               0,
		"error_note":          "Success",
	})
}

func asFloat(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case string:
		f, _ := strconv.ParseFloat(t, 64)
		return f
	case json.Number:
		f, _ := t.Float64()
		return f
	default:
		return 0
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
