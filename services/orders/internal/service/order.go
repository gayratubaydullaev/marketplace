package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gayrat/marketplace/packages/go-common/commerce"
	commondb "github.com/gayrat/marketplace/packages/go-common/db"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/services/orders/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

var transitions = map[string][]string{
	"pending":             {"confirmed", "cancelled"},
	"confirmed":           {"processing", "refunded", "cancelled"},
	"processing":          {"shipped", "returned", "cancelled"},
	"shipped":             {"delivered", "returned", "partially_returned"},
	"delivered":           {"completed", "returned", "partially_returned"},
	"completed":           {"returned", "partially_returned"},
	"partially_returned":  {"returned", "completed"},
	"cancelled":           {},
	"refunded":            {},
	"returned":            {},
}

// ValidateStatusTransition enforces the order state machine from FR-5.3:
// pending → confirmed → processing → shipped → delivered → completed, with
// cancelled, refunded, and returned terminal branches.
func ValidateStatusTransition(current, next string) error {
	for _, allowed := range transitions[current] {
		if allowed == next {
			return nil
		}
	}
	return fmt.Errorf("cannot transition %s -> %s", current, next)
}

type OrderService struct {
	Repo     *repository.OrderRepository
	Producer *kafkax.Producer
}

func NewOrderService(repo *repository.OrderRepository, producer *kafkax.Producer) *OrderService {
	return &OrderService{Repo: repo, Producer: producer}
}

type CreateInput struct {
	CartID, GuestEmail, GuestID, Notes, AddressID, PaymentMethod string
	ShippingAddress                                              json.RawMessage
	TenantID, UserID                                             string
}

func (s *OrderService) Create(ctx context.Context, in CreateInput) (map[string]any, error) {
	if in.CartID == "" {
		return nil, fmt.Errorf("cart_id required (server-priced orders)")
	}
	if in.ShippingAddress == nil {
		return nil, fmt.Errorf("shipping_address required")
	}
	var address map[string]any
	_ = json.Unmarshal(in.ShippingAddress, &address)
	region, _ := address["region"].(string)
	if region == "" {
		return nil, fmt.Errorf("shipping_address.region required")
	}

	var out map[string]any
	err := commondb.WithTenant(s.Repo.DB, in.TenantID, func(tx *sqlx.Tx) error {
		if in.AddressID != "" && in.UserID != "" {
			var lat, lng *float64
			_ = tx.QueryRow(
				`SELECT lat, lng FROM addresses WHERE id=$1 AND user_id=$2 AND tenant_id=$3`,
				in.AddressID, in.UserID, in.TenantID,
			).Scan(&lat, &lng)
			if lat != nil && lng != nil {
				if _, ok := address["lat"]; !ok {
					address["lat"] = *lat
				}
				if _, ok := address["lng"]; !ok {
					address["lng"] = *lng
				}
			}
		}
		shipBytes, _ := json.Marshal(address)
		in.ShippingAddress = shipBytes

		var cartMeta struct {
			UserID              *string `db:"user_id"`
			GuestID             *string `db:"guest_id"`
			CouponCode          *string `db:"coupon_code"`
			GiftCertificateCode *string `db:"gift_certificate_code"`
		}
		if err := tx.Get(&cartMeta, `SELECT user_id, guest_id, coupon_code, gift_certificate_code FROM carts WHERE id=$1 AND tenant_id=$2`, in.CartID, in.TenantID); err != nil {
			return fmt.Errorf("cart empty or not found")
		}
		if in.UserID != "" {
			if cartMeta.UserID == nil || *cartMeta.UserID != in.UserID {
				return fmt.Errorf("cart empty or not found")
			}
		} else {
			if cartMeta.GuestID == nil || in.GuestID == "" || *cartMeta.GuestID != in.GuestID {
				return fmt.Errorf("cart empty or not found")
			}
		}
		var cart []struct {
			ProductID string  `db:"product_id"`
			VariantID *string `db:"variant_id"`
			Quantity  int     `db:"quantity"`
		}
		if err := tx.Select(&cart, `SELECT product_id, variant_id, quantity FROM cart_items WHERE cart_id=$1`, in.CartID); err != nil || len(cart) == 0 {
			return fmt.Errorf("cart empty or not found")
		}
		type line struct {
			ProductID       string
			VariantID       *string
			VendorID        *string
			Title           string
			Quantity        int
			UnitPrice       float64
			InventoryPolicy string
		}
		lines := make([]line, 0, len(cart))
		var subtotal float64
		for _, item := range cart {
			var line line
			line.ProductID, line.Quantity, line.VariantID = item.ProductID, item.Quantity, item.VariantID
			if err := tx.QueryRow(`SELECT price, COALESCE(translations->'uz'->>'name', slug), vendor_id, COALESCE(inventory_policy,'deny') FROM products WHERE id=$1 AND tenant_id=$2 AND status IN ('active','out_of_stock')`, item.ProductID, in.TenantID).Scan(&line.UnitPrice, &line.Title, &line.VendorID, &line.InventoryPolicy); err != nil {
				return fmt.Errorf("product unavailable: %s", item.ProductID)
			}
			if item.VariantID != nil && *item.VariantID != "" {
				if err := tx.QueryRow(`SELECT price, COALESCE(title, $1) FROM product_variants WHERE id=$2 AND product_id=$3`, line.Title, *item.VariantID, item.ProductID).Scan(&line.UnitPrice, &line.Title); err != nil {
					return fmt.Errorf("variant unavailable: %s", *item.VariantID)
				}
			} else {
				line.VariantID = nil
			}
			subtotal += float64(line.Quantity) * line.UnitPrice
			lines = append(lines, line)
		}

		var couponDiscount, giftAmount float64
		var couponCode *string
		if cartMeta.CouponCode != nil && *cartMeta.CouponCode != "" {
			var spec commerce.CouponSpec
			err := tx.QueryRow(`
				SELECT type, value, min_order, max_uses, used_count, starts_at, ends_at, status
				FROM coupons WHERE tenant_id=$1 AND code=$2`, in.TenantID, *cartMeta.CouponCode,
			).Scan(&spec.Type, &spec.Value, &spec.MinOrder, &spec.MaxUses, &spec.UsedCount, &spec.StartsAt, &spec.EndsAt, &spec.Status)
			if err == nil {
				couponDiscount = commerce.CouponDiscount(subtotal, spec)
				if couponDiscount > 0 {
					code := *cartMeta.CouponCode
					couponCode = &code
				}
			}
		}
		remaining := subtotal - couponDiscount
		if cartMeta.GiftCertificateCode != nil && *cartMeta.GiftCertificateCode != "" {
			var bal float64
			var status string
			err := tx.QueryRow(`SELECT balance, status FROM gift_certificates WHERE tenant_id=$1 AND code=$2`, in.TenantID, *cartMeta.GiftCertificateCode).Scan(&bal, &status)
			if err == nil {
				giftAmount = commerce.GiftApply(remaining, bal, status)
			}
		}
		discountTotal := couponDiscount + giftAmount
		merchandise := subtotal - discountTotal
		if merchandise < 0 {
			merchandise = 0
		}
		shippingCost := 0.0
		if est, err := commerce.ProviderFromEnv().Estimate(region, merchandise); err == nil {
			shippingCost = est.Cost
		} else {
			shippingCost = commerce.EstimateShipping(region, merchandise)
		}
		taxRate := resolveTaxRate(tx, in.TenantID)
		taxable := merchandise
		if taxRate < 0 {
			taxRate = 0
		}
		taxTotal := roundMoney(taxable * taxRate / 100)
		orderTotal := merchandise + shippingCost + taxTotal

		id, number := uuid.NewString(), randomOrderNumber()
		var userID, guestEmail *string
		if in.UserID != "" {
			userID = &in.UserID
		}
		if in.GuestEmail != "" {
			guestEmail = &in.GuestEmail
		}
		meta := map[string]any{}
		if in.GuestID != "" && userID == nil {
			meta["guest_id"] = in.GuestID
		}
		if cartMeta.GiftCertificateCode != nil && giftAmount > 0 {
			meta["gift_certificate_code"] = *cartMeta.GiftCertificateCode
			meta["gift_amount"] = giftAmount
		}
		if couponDiscount > 0 {
			meta["coupon_discount"] = couponDiscount
		}
		meta["tax_rate"] = taxRate
		meta["tax_breakdown"] = map[string]any{
			"name": "VAT", "rate": taxRate, "base": taxable, "amount": taxTotal,
		}
		metaJSON, _ := json.Marshal(meta)

		_, err := tx.Exec(`INSERT INTO orders (id, tenant_id, user_id, guest_email, order_number, status, payment_status, payment_method, fulfillment_status, currency, subtotal, discount, shipping_cost, tax_total, total, coupon_code, shipping_address, notes, metadata) VALUES ($1,$2,$3,$4,$5,'pending','unpaid',$6,'unfulfilled','UZS',$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
			id, in.TenantID, userID, guestEmail, number, in.PaymentMethod, subtotal, discountTotal, shippingCost, taxTotal, orderTotal, couponCode, in.ShippingAddress, in.Notes, metaJSON)
		if err != nil {
			return err
		}
		commissionRate := 10.0
		_ = tx.Get(&commissionRate, `SELECT commission_rate FROM tenants WHERE id=$1`, in.TenantID)
		for _, line := range lines {
			lineTotal := float64(line.Quantity) * line.UnitPrice
			rate := commissionRate
			if line.VendorID != nil && *line.VendorID != "" {
				var vendorRate *float64
				_ = tx.Get(&vendorRate, `SELECT commission_rate FROM vendors WHERE id=$1 AND tenant_id=$2`, *line.VendorID, in.TenantID)
				if vendorRate != nil {
					rate = *vendorRate
				}
			}
			_, err = tx.Exec(`INSERT INTO order_items (id, order_id, tenant_id, vendor_id, product_id, variant_id, title, quantity, unit_price, total_price, commission_rate, commission_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
				uuid.NewString(), id, in.TenantID, line.VendorID, line.ProductID, line.VariantID, line.Title, line.Quantity, line.UnitPrice, lineTotal, rate, lineTotal*rate/100)
			if err != nil {
				return err
			}
			denyStock := line.InventoryPolicy != "continue"
			if line.VariantID != nil && *line.VariantID != "" {
				var avail int
				if err := tx.QueryRow(`SELECT inventory_quantity FROM product_variants WHERE id=$1 FOR UPDATE`, *line.VariantID).Scan(&avail); err != nil {
					return fmt.Errorf("variant unavailable: %s", *line.VariantID)
				}
				if denyStock && avail < line.Quantity {
					return fmt.Errorf("insufficient stock for variant %s", *line.VariantID)
				}
				if _, err := tx.Exec(`UPDATE product_variants SET inventory_quantity=GREATEST(0, inventory_quantity-$1) WHERE id=$2`, line.Quantity, *line.VariantID); err != nil {
					return err
				}
			}
			var productAvail int
			if err := tx.QueryRow(`SELECT inventory_quantity FROM products WHERE id=$1 FOR UPDATE`, line.ProductID).Scan(&productAvail); err != nil {
				return fmt.Errorf("product unavailable: %s", line.ProductID)
			}
			if denyStock && productAvail < line.Quantity {
				return fmt.Errorf("insufficient stock for product %s", line.ProductID)
			}
			if _, err := tx.Exec(`UPDATE products SET inventory_quantity=GREATEST(0, inventory_quantity-$1), sales_count=sales_count+$1, status=CASE WHEN inventory_quantity-$1<=0 AND COALESCE(inventory_policy,'deny')<>'continue' THEN 'out_of_stock' ELSE status END, updated_at=NOW() WHERE id=$2`, line.Quantity, line.ProductID); err != nil {
				return err
			}
		}
		if couponCode != nil {
			if _, err := tx.Exec(`UPDATE coupons SET used_count=used_count+1 WHERE tenant_id=$1 AND code=$2`, in.TenantID, *couponCode); err != nil {
				return err
			}
		}
		if cartMeta.GiftCertificateCode != nil && giftAmount > 0 {
			res, err := tx.Exec(`UPDATE gift_certificates SET balance=balance-$1, status=CASE WHEN balance-$1<=0 THEN 'redeemed' ELSE status END WHERE tenant_id=$2 AND code=$3 AND balance>=$1 AND status='active'`, giftAmount, in.TenantID, *cartMeta.GiftCertificateCode)
			if err != nil {
				return err
			}
			if n, _ := res.RowsAffected(); n == 0 {
				return fmt.Errorf("gift certificate unavailable")
			}
		}
		if _, err := tx.Exec(`UPDATE carts SET coupon_code=NULL, gift_certificate_code=NULL, updated_at=NOW() WHERE id=$1`, in.CartID); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM cart_items WHERE cart_id=$1`, in.CartID); err != nil {
			return err
		}
		out = map[string]any{
			"id":             id,
			"order_number":   number,
			"subtotal":       subtotal,
			"discount":       discountTotal,
			"shipping_cost":  shippingCost,
			"tax_total":      taxTotal,
			"tax_rate":       taxRate,
			"total":          orderTotal,
			"status":         "pending",
			"payment_status": "unpaid",
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	id, _ := out["id"].(string)
	orderTotal, _ := out["total"].(float64)
	var userID any
	if in.UserID != "" {
		userID = in.UserID
	}
	_ = s.Producer.Publish(ctx, "order.created", id, map[string]any{"order_id": id, "total": orderTotal, "currency": "UZS", "tenant_id": in.TenantID, "user_id": userID, "status": "pending"})
	return out, nil
}

func (s *OrderService) Transition(ctx context.Context, id, tenantID, status string) error {
	var userID *string
	var orderTenant string
	err := commondb.WithTenant(s.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
		var current, paymentStatus string
		if err := tx.QueryRow(`SELECT status,user_id,tenant_id,COALESCE(payment_status,'unpaid') FROM orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, id, tenantID).Scan(&current, &userID, &orderTenant, &paymentStatus); err != nil {
			return err
		}
		if err := ValidateStatusTransition(current, status); err != nil {
			return err
		}
		// Hand-off (delivered / completed) requires payment so COD cannot skip collection.
		if (status == "delivered" || status == "completed") && paymentStatus != "paid" {
			return fmt.Errorf("collect payment before marking order as %s", status)
		}
		if status == "cancelled" && paymentStatus == "paid" {
			return fmt.Errorf("paid orders must be refunded, not cancelled")
		}
		fulfillment := map[string]string{"shipped": "shipped", "delivered": "fulfilled", "completed": "fulfilled", "cancelled": "cancelled"}[status]
		if fulfillment != "" {
			if _, err := tx.Exec(`UPDATE orders SET status=$1,fulfillment_status=$2,updated_at=NOW() WHERE id=$3 AND tenant_id=$4`, status, fulfillment, id, tenantID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(`UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, status, id, tenantID); err != nil {
				return err
			}
		}
		if status == "cancelled" && current != "cancelled" {
			if err := restoreOrderReservations(tx, id, tenantID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	topic := "order.status_updated"
	if status == "shipped" {
		topic = "order.shipped"
	}
	if status == "cancelled" {
		topic = "order.cancelled"
	}
	return s.Producer.Publish(ctx, topic, id, map[string]any{"order_id": id, "status": status, "user_id": userID, "tenant_id": orderTenant})
}

func restoreOrderReservations(tx *sqlx.Tx, orderID, tenantID string) error {
	var items []struct {
		ProductID string  `db:"product_id"`
		VariantID *string `db:"variant_id"`
		Quantity  int     `db:"quantity"`
	}
	if err := tx.Select(&items, `SELECT product_id, variant_id, quantity FROM order_items WHERE order_id=$1 AND tenant_id=$2`, orderID, tenantID); err != nil {
		return err
	}
	for _, it := range items {
		if it.VariantID != nil && *it.VariantID != "" {
			if _, err := tx.Exec(`UPDATE product_variants SET inventory_quantity=inventory_quantity+$1 WHERE id=$2`, it.Quantity, *it.VariantID); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(`
			UPDATE products SET
				inventory_quantity=inventory_quantity+$1,
				sales_count=GREATEST(0, sales_count-$1),
				status=CASE WHEN status='out_of_stock' AND inventory_quantity+$1>0 THEN 'active' ELSE status END,
				updated_at=NOW()
			WHERE id=$2 AND tenant_id=$3`, it.Quantity, it.ProductID, tenantID); err != nil {
			return err
		}
	}

	var couponCode *string
	var metaJSON []byte
	if err := tx.QueryRow(`SELECT coupon_code, COALESCE(metadata,'{}') FROM orders WHERE id=$1 AND tenant_id=$2`, orderID, tenantID).Scan(&couponCode, &metaJSON); err != nil {
		return err
	}
	if couponCode != nil && *couponCode != "" {
		if _, err := tx.Exec(`UPDATE coupons SET used_count=GREATEST(0, used_count-1) WHERE tenant_id=$1 AND code=$2`, tenantID, *couponCode); err != nil {
			return err
		}
	}
	var meta map[string]any
	_ = json.Unmarshal(metaJSON, &meta)
	if code, _ := meta["gift_certificate_code"].(string); code != "" {
		giftAmount, _ := meta["gift_amount"].(float64)
		if giftAmount > 0 {
			if _, err := tx.Exec(`
				UPDATE gift_certificates SET
					balance=balance+$1,
					status=CASE WHEN status='redeemed' THEN 'active' ELSE status END
				WHERE tenant_id=$2 AND code=$3`, giftAmount, tenantID, code); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *OrderService) Refund(ctx context.Context, id, tenantID string) error {
	return s.RefundReturn(ctx, id, tenantID, nil, 0)
}

type ReturnLine struct {
	OrderItemID string `json:"order_item_id"`
	Quantity    int    `json:"quantity"`
	ProductID   string `json:"product_id"`
	VariantID   string `json:"variant_id"`
}

// RefundReturn restores stock for returned lines (or all items when lines empty) and marks payment refunded/partial.
func (s *OrderService) RefundReturn(ctx context.Context, id, tenantID string, lines []ReturnLine, refundAmount float64) error {
	live := os.Getenv("PAYMENTS_SANDBOX") == "false"
	fullRefund := len(lines) == 0
	if live && fullRefund {
		paymentsURL := strings.TrimRight(os.Getenv("PAYMENTS_URL"), "/")
		if paymentsURL == "" {
			paymentsURL = "http://127.0.0.1:8006"
		}
		if err := callPaymentsRefund(ctx, paymentsURL, id, tenantID); err != nil {
			return err
		}
	}

	var userID *string
	err := commondb.WithTenant(s.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
		var paymentStatus string
		var orderTotal float64
		if err := tx.QueryRow(
			`SELECT COALESCE(payment_status,'unpaid'), user_id, total FROM orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
			id, tenantID,
		).Scan(&paymentStatus, &userID, &orderTotal); err != nil {
			return err
		}
		if paymentStatus != "paid" && paymentStatus != "refunded" && paymentStatus != "partially_refunded" {
			return fmt.Errorf("only paid orders can be refunded")
		}
		if fullRefund {
			if paymentStatus != "refunded" {
				if _, err := tx.Exec(
					`UPDATE orders SET payment_status='refunded', updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
					id, tenantID,
				); err != nil {
					return err
				}
			}
			if !live {
				if _, err := tx.Exec(
					`UPDATE payments SET status='refunded', updated_at=NOW() WHERE order_id=$1 AND status='succeeded'`,
					id,
				); err != nil {
					return err
				}
			}
			return restoreOrderReservations(tx, id, tenantID)
		}

		// Partial: restore only returned quantities.
		for _, line := range lines {
			if line.Quantity <= 0 {
				continue
			}
			var productID string
			var variantID *string
			if err := tx.QueryRow(`SELECT product_id, variant_id FROM order_items WHERE id=$1 AND order_id=$2`, line.OrderItemID, id).Scan(&productID, &variantID); err != nil {
				return fmt.Errorf("order item not found: %s", line.OrderItemID)
			}
			if variantID != nil && *variantID != "" {
				if _, err := tx.Exec(`UPDATE product_variants SET inventory_quantity=inventory_quantity+$1 WHERE id=$2`, line.Quantity, *variantID); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(`
				UPDATE products SET
					inventory_quantity=inventory_quantity+$1,
					sales_count=GREATEST(0, sales_count-$1),
					status=CASE WHEN status='out_of_stock' AND inventory_quantity+$1>0 THEN 'active' ELSE status END,
					updated_at=NOW()
				WHERE id=$2 AND tenant_id=$3`, line.Quantity, productID, tenantID); err != nil {
				return err
			}
		}
		payStatus := "partially_refunded"
		if refundAmount > 0 && refundAmount >= orderTotal-0.01 {
			payStatus = "refunded"
		}
		if _, err := tx.Exec(`UPDATE orders SET payment_status=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, payStatus, id, tenantID); err != nil {
			return err
		}
		if !live {
			_, _ = tx.Exec(`UPDATE payments SET status=$1, updated_at=NOW() WHERE order_id=$2 AND status='succeeded'`, payStatus, id)
		}
		return nil
	})
	if err != nil {
		return err
	}
	return s.Producer.Publish(ctx, "order.refunded", id, map[string]any{
		"order_id": id, "tenant_id": tenantID, "user_id": userID, "partial": !fullRefund, "refund_amount": refundAmount,
	})
}

func callPaymentsRefund(ctx context.Context, baseURL, orderID, tenantID string) error {
	body, _ := json.Marshal(map[string]string{"order_id": orderID})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/v1/payments/refund", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", tenantID)
	if key := os.Getenv("INTERNAL_SERVICE_KEY"); key != "" {
		req.Header.Set("X-Internal-Key", key)
	}
	if tok := os.Getenv("INTERNAL_SERVICE_JWT"); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := (&http.Client{Timeout: 25 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("payments refund unreachable: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("payments refund failed: %s", strings.TrimSpace(string(raw)))
	}
	return nil
}

func (s *OrderService) SetTracking(ctx context.Context, id, tenantID, carrier, number, trackingURL string) error {
	var publishShipped bool
	err := commondb.WithTenant(s.Repo.DB, tenantID, func(tx *sqlx.Tx) error {
		var status string
		if err := tx.Get(&status, `SELECT status FROM orders WHERE id=$1 AND tenant_id=$2`, id, tenantID); err != nil {
			return err
		}
		if status == "processing" {
			_, err := tx.Exec(`UPDATE orders SET tracking_carrier=$1, tracking_number=$2, tracking_url=$3, status='shipped', fulfillment_status='shipped', shipped_at=NOW(), updated_at=NOW() WHERE id=$4 AND tenant_id=$5`, carrier, number, nullableString(trackingURL), id, tenantID)
			if err != nil {
				return err
			}
			publishShipped = true
			return nil
		}
		_, err := tx.Exec(`UPDATE orders SET tracking_carrier=$1, tracking_number=$2, tracking_url=$3, updated_at=NOW() WHERE id=$4 AND tenant_id=$5`, carrier, number, nullableString(trackingURL), id, tenantID)
		return err
	})
	if err != nil {
		return err
	}
	if publishShipped {
		return s.Producer.Publish(ctx, "order.shipped", id, map[string]any{"order_id": id, "status": "shipped", "tenant_id": tenantID})
	}
	return nil
}

func nullableString(v string) any {
	if v == "" {
		return nil
	}
	return v
}

// randomOrderNumber returns an unpredictable public order reference (not time-based).
func randomOrderNumber() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	buf := make([]byte, 10)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("GZ-%s", uuid.NewString()[:10])
	}
	for i := range buf {
		buf[i] = alphabet[int(buf[i])%len(alphabet)]
	}
	return "GZ-" + string(buf)
}

func resolveTaxRate(tx *sqlx.Tx, tenantID string) float64 {
	var rate float64
	err := tx.QueryRow(`
		SELECT COALESCE(
			NULLIF(settings->>'tax_rate','')::float,
			NULLIF(settings->'tax'->>'rate','')::float,
			12
		)
		FROM tenants WHERE id=$1`, tenantID).Scan(&rate)
	if err != nil {
		return 12
	}
	return rate
}

func roundMoney(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

// ClassifyCreateError maps create failures to HTTP-ish codes for the handler.
func ClassifyCreateError(err error) (clientMsg string, badRequest bool) {
	if err == nil {
		return "", false
	}
	msg := err.Error()
	lower := strings.ToLower(msg)
	switch {
	case strings.Contains(lower, "cart empty"),
		strings.Contains(lower, "cart_id required"),
		strings.Contains(lower, "shipping_address"),
		strings.Contains(lower, "unavailable"),
		strings.Contains(lower, "insufficient stock"),
		strings.Contains(lower, "gift certificate"):
		return msg, true
	default:
		return msg, false
	}
}
