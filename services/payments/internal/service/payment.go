package service

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	commondb "github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/services/payments/internal/model"
	"github.com/gayrat/marketplace/services/payments/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

func Providers() map[string]Provider {
	sandbox := Sandbox()
	return map[string]Provider{
		"payme":            PaymeProvider{MerchantID: envOr("PAYME_MERCHANT_ID", sandboxFallback(sandbox, "gayrat-payme")), Secret: envOr("PAYME_SECRET", sandboxFallback(sandbox, "payme-sandbox-secret"))},
		"click":            ClickProvider{MerchantID: envOr("CLICK_MERCHANT_ID", sandboxFallback(sandbox, "gayrat-click")), Secret: envOr("CLICK_SECRET", sandboxFallback(sandbox, "click-sandbox-secret"))},
		"uzum":             UzumProvider{MerchantID: envOr("UZUM_MERCHANT_ID", sandboxFallback(sandbox, "gayrat-uzum")), Secret: envOr("UZUM_SECRET", sandboxFallback(sandbox, "uzum-sandbox-secret"))},
		"stripe":           StripeProvider{Secret: envOr("STRIPE_SECRET", sandboxFallback(sandbox, "sk_test_dev")), WebhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET")},
		"paypal":           PayPalProvider{ClientID: os.Getenv("PAYPAL_CLIENT_ID"), ClientSecret: os.Getenv("PAYPAL_CLIENT_SECRET")},
		"bank_transfer":    BankTransferProvider{},
		"cash_on_delivery": CashOnDeliveryProvider{},
		"card_on_delivery": CardOnDeliveryProvider{},
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func sandboxFallback(sandbox bool, value string) string {
	if sandbox {
		return value
	}
	return ""
}

// ValidateProviderSecrets refuses to boot outside sandbox without real PSP credentials.
func ValidateProviderSecrets() error {
	if Sandbox() {
		return nil
	}
	required := []string{"PAYME_SECRET", "CLICK_SECRET", "UZUM_SECRET", "STRIPE_SECRET"}
	var missing []string
	for _, key := range required {
		if os.Getenv(key) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("live payments require secrets: %v (set PAYMENTS_SANDBOX=true for local/demo)", missing)
	}
	return nil
}

type PaymentService struct {
	Repo     *repository.PaymentRepository
	Producer *kafkax.Producer
}

func New(repo *repository.PaymentRepository, producer *kafkax.Producer) *PaymentService {
	return &PaymentService{repo, producer}
}

// MarkPaid confirms a payment idempotently: succeeds payment + order, creates splits once, publishes order.paid once.
func (s *PaymentService) MarkPaid(ctx context.Context, p model.Payment) error {
	tx, err := s.Repo.DB.Beginx()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`SELECT set_config('app.current_tenant', $1, true)`, p.TenantID); err != nil {
		return err
	}

	var payStatus string
	if err := tx.QueryRow(`SELECT status FROM payments WHERE id=$1 FOR UPDATE`, p.ID).Scan(&payStatus); err != nil {
		return err
	}
	if payStatus == "succeeded" {
		return tx.Commit()
	}

	var orderStatus, orderPayStatus string
	if err := tx.QueryRow(`SELECT status, COALESCE(payment_status,'unpaid') FROM orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, p.OrderID, p.TenantID).Scan(&orderStatus, &orderPayStatus); err != nil {
		return fmt.Errorf("order not found")
	}
	if orderPayStatus == "paid" {
		if _, err := tx.Exec(`UPDATE payments SET status='succeeded', updated_at=NOW() WHERE id=$1`, p.ID); err != nil {
			return err
		}
		if err := s.createSplitsTx(tx, p); err != nil {
			return fmt.Errorf("payment_splits: %w", err)
		}
		return tx.Commit()
	}
	if orderPayStatus != "unpaid" {
		return fmt.Errorf("order payment_status=%s cannot be paid", orderPayStatus)
	}
	switch orderStatus {
	case "cancelled", "refunded", "returned":
		return fmt.Errorf("order status=%s cannot be paid", orderStatus)
	}

	if _, err := tx.Exec(`UPDATE payments SET status='succeeded', updated_at=NOW() WHERE id=$1 AND status<>'succeeded'`, p.ID); err != nil {
		return err
	}
	res, err := tx.Exec(`UPDATE orders SET
			payment_status='paid',
			status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
			updated_at=NOW()
		WHERE id=$1 AND payment_status='unpaid' AND status NOT IN ('cancelled','refunded','returned')`, p.OrderID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("order payment transition failed")
	}
	_, _ = tx.Exec(`UPDATE order_items SET status='confirmed' WHERE order_id=$1 AND status='pending'`, p.OrderID)

	if err := s.createSplitsTx(tx, p); err != nil {
		return fmt.Errorf("payment_splits: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if err := s.Producer.Publish(ctx, "order.paid", p.OrderID, map[string]any{
		"order_id": p.OrderID, "payment_id": p.ID, "amount": p.Amount, "user_id": p.UserID, "tenant_id": p.TenantID, "paid_at": time.Now(),
	}); err != nil {
		// Payment is already committed; do not fail the client on async fan-out.
		fmt.Printf("payments: order.paid publish failed for %s: %v\n", p.OrderID, err)
	}
	return nil
}

func (s *PaymentService) createSplitsTx(tx *sqlx.Tx, p model.Payment) error {
	var existing int
	if err := tx.Get(&existing, `SELECT COUNT(*) FROM payment_splits WHERE payment_id=$1`, p.ID); err != nil {
		return err
	}
	if existing > 0 {
		return nil
	}

	type line struct {
		VendorID          *string `db:"vendor_id"`
		Total             float64 `db:"total_price"`
		Rate              float64 `db:"commission_rate"`
		CommissionAmount  float64 `db:"commission_amount"`
	}
	var lines []line
	if err := tx.Select(&lines, `SELECT vendor_id, total_price, COALESCE(commission_rate,10) AS commission_rate, COALESCE(commission_amount,0) AS commission_amount FROM order_items WHERE order_id=$1`, p.OrderID); err != nil {
		return err
	}
	insert := func(vendorID *string, gross, rate, commission, vendorAmt float64) error {
		_, err := tx.Exec(`INSERT INTO payment_splits (id, tenant_id, payment_id, order_id, vendor_id, gross_amount, commission_rate, commission_amount, vendor_amount, currency, status)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UZS','pending')`,
			uuid.NewString(), p.TenantID, p.ID, p.OrderID, vendorID, gross, rate, commission, vendorAmt)
		return err
	}
	if len(lines) == 0 {
		return insert(nil, p.Amount, 100, p.Amount, 0)
	}

	var order struct {
		Subtotal     float64 `db:"subtotal"`
		Discount     float64 `db:"discount"`
		ShippingCost float64 `db:"shipping_cost"`
	}
	_ = tx.Get(&order, `SELECT subtotal, COALESCE(discount,0) AS discount, COALESCE(shipping_cost,0) AS shipping_cost FROM orders WHERE id=$1`, p.OrderID)

	merchandiseSum := 0.0
	for _, l := range lines {
		merchandiseSum += l.Total
	}

	var allocatedGross float64
	for _, l := range lines {
		share := 0.0
		if merchandiseSum > 0 && order.Discount > 0 {
			share = l.Total / merchandiseSum * order.Discount
		}
		net := l.Total - share
		if net < 0 {
			net = 0
		}
		rate := l.Rate
		if rate <= 0 {
			rate = 10
		}
		commission := net * rate / 100
		if l.CommissionAmount > 0 && order.Discount == 0 {
			commission = l.CommissionAmount
			if commission > net {
				commission = net
			}
		}
		vendorAmt := net - commission
		if err := insert(l.VendorID, net, rate, commission, vendorAmt); err != nil {
			return err
		}
		allocatedGross += net
	}

	remainder := p.Amount - allocatedGross
	if math.Abs(remainder) >= 0.01 {
		// Shipping and rounding → platform; negative remainder absorbs discount leftovers.
		if remainder > 0 {
			if err := insert(nil, remainder, 100, remainder, 0); err != nil {
				return err
			}
		} else {
			if err := insert(nil, remainder, 0, 0, 0); err != nil {
				return err
			}
		}
	}
	return nil
}

// MarkRefunded reverses a succeeded payment: PSP refund (live) + DB status + order payment_status.
func (s *PaymentService) MarkRefunded(ctx context.Context, orderID, tenantID string) error {
	var payment model.Payment
	err := commondb.WithTenant(s.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&payment, `
			SELECT id,tenant_id,order_id,user_id,amount,currency,provider,provider_payment_id,status,created_at
			FROM payments
			WHERE order_id=$1 AND tenant_id=$2 AND status IN ('succeeded','refunded')
			ORDER BY created_at DESC LIMIT 1`, orderID, tenantID)
	})
	if err != nil {
		return fmt.Errorf("succeeded payment not found for order")
	}
	if payment.Status == "refunded" {
		return nil
	}

	if !Sandbox() {
		if err := refundWithProvider(payment); err != nil {
			return err
		}
	}

	tx, err := s.Repo.DB.Beginx()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`SELECT set_config('app.current_tenant', $1, true)`, tenantID); err != nil {
		return err
	}
	var payStatus string
	if err := tx.QueryRow(`SELECT status FROM payments WHERE id=$1 FOR UPDATE`, payment.ID).Scan(&payStatus); err != nil {
		return err
	}
	if payStatus == "refunded" {
		return tx.Commit()
	}
	if payStatus != "succeeded" {
		return fmt.Errorf("payment status=%s cannot be refunded", payStatus)
	}
	if _, err := tx.Exec(`UPDATE payments SET status='refunded', updated_at=NOW() WHERE id=$1`, payment.ID); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE orders SET payment_status='refunded', updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, orderID, tenantID); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE payment_splits SET status='reversed' WHERE payment_id=$1 AND status='pending'`, payment.ID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	_ = s.Producer.Publish(ctx, "order.refunded", orderID, map[string]any{
		"order_id": orderID, "payment_id": payment.ID, "tenant_id": tenantID, "user_id": payment.UserID, "payment_status": "refunded",
	})
	return nil
}

func refundWithProvider(p model.Payment) error {
	switch p.Provider {
	case "stripe":
		secret := os.Getenv("STRIPE_SECRET")
		if secret == "" {
			return fmt.Errorf("STRIPE_SECRET required for live refund")
		}
		return stripeRefund(secret, p)
	case "cash_on_delivery", "card_on_delivery", "bank_transfer":
		return nil
	case "payme", "click", "uzum", "paypal":
		return fmt.Errorf("live refund for provider %s is not automated yet — refund in PSP dashboard then confirm", p.Provider)
	default:
		return fmt.Errorf("unsupported refund provider %s", p.Provider)
	}
}

func stripeRefund(secret string, p model.Payment) error {
	form := url.Values{}
	form.Set("amount", fmt.Sprintf("%d", int64(p.Amount*100)))
	if strings.HasPrefix(p.ProviderPaymentID, "pi_") {
		form.Set("payment_intent", p.ProviderPaymentID)
	} else if strings.HasPrefix(p.ProviderPaymentID, "ch_") {
		form.Set("charge", p.ProviderPaymentID)
	} else {
		return fmt.Errorf("stripe refund needs payment_intent or charge id, got %q", p.ProviderPaymentID)
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.stripe.com/v1/refunds", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(secret, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("stripe refund: %s", strings.TrimSpace(string(body)))
	}
	return nil
}
