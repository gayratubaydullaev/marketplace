package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gayrat/marketplace/packages/go-common/commerce"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/services/orders/internal/repository"
	"github.com/google/uuid"
)

var transitions = map[string][]string{
	"pending":   {"confirmed", "cancelled"},
	"confirmed": {"processing", "refunded"},
	"processing": {"shipped", "returned"},
	"shipped":    {"delivered"},
	"delivered":  {"completed"},
	"completed":  {},
	"cancelled":  {},
	"refunded":   {},
	"returned":   {},
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
	CartID, GuestEmail, GuestID, Notes, AddressID string
	ShippingAddress                               json.RawMessage
	TenantID, UserID                              string
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
	var cartMeta struct {
		UserID              *string `db:"user_id"`
		GuestID             *string `db:"guest_id"`
		CouponCode          *string `db:"coupon_code"`
		GiftCertificateCode *string `db:"gift_certificate_code"`
	}
	if err := s.Repo.DB.Get(&cartMeta, `SELECT user_id, guest_id, coupon_code, gift_certificate_code FROM carts WHERE id=$1 AND tenant_id=$2`, in.CartID, in.TenantID); err != nil {
		return nil, fmt.Errorf("cart empty or not found")
	}
	if in.UserID != "" {
		if cartMeta.UserID == nil || *cartMeta.UserID != in.UserID {
			return nil, fmt.Errorf("cart empty or not found")
		}
	} else {
		if cartMeta.GuestID == nil || in.GuestID == "" || *cartMeta.GuestID != in.GuestID {
			return nil, fmt.Errorf("cart empty or not found")
		}
	}
	var cart []struct {
		ProductID string  `db:"product_id"`
		VariantID *string `db:"variant_id"`
		Quantity  int     `db:"quantity"`
	}
	if err := s.Repo.DB.Select(&cart, `SELECT product_id, variant_id, quantity FROM cart_items WHERE cart_id=$1`, in.CartID); err != nil || len(cart) == 0 {
		return nil, fmt.Errorf("cart empty or not found")
	}
	type line struct {
		ProductID string
		VariantID *string
		VendorID  *string
		Title     string
		Quantity  int
		UnitPrice float64
	}
	lines := make([]line, 0, len(cart))
	var subtotal float64
	for _, item := range cart {
		var line line
		line.ProductID, line.Quantity, line.VariantID = item.ProductID, item.Quantity, item.VariantID
		if err := s.Repo.DB.QueryRow(`SELECT price, COALESCE(translations->'uz'->>'name', slug), vendor_id FROM products WHERE id=$1 AND tenant_id=$2 AND status IN ('active','out_of_stock')`, item.ProductID, in.TenantID).Scan(&line.UnitPrice, &line.Title, &line.VendorID); err != nil {
			return nil, fmt.Errorf("product unavailable: %s", item.ProductID)
		}
		if item.VariantID != nil && *item.VariantID != "" {
			if err := s.Repo.DB.QueryRow(`SELECT price, COALESCE(title, $1) FROM product_variants WHERE id=$2 AND product_id=$3`, line.Title, *item.VariantID, item.ProductID).Scan(&line.UnitPrice, &line.Title); err != nil {
				return nil, fmt.Errorf("variant unavailable: %s", *item.VariantID)
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
		err := s.Repo.DB.QueryRow(`
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
		err := s.Repo.DB.QueryRow(`SELECT balance, status FROM gift_certificates WHERE tenant_id=$1 AND code=$2`, in.TenantID, *cartMeta.GiftCertificateCode).Scan(&bal, &status)
		if err == nil {
			giftAmount = commerce.GiftApply(remaining, bal, status)
		}
	}
	discountTotal := couponDiscount + giftAmount
	merchandise := subtotal - discountTotal
	if merchandise < 0 {
		merchandise = 0
	}
	shippingCost := commerce.EstimateShipping(region, merchandise)
	orderTotal := merchandise + shippingCost

	id, number := uuid.NewString(), fmt.Sprintf("GZ-%d", time.Now().Unix()%100000000)
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
	metaJSON, _ := json.Marshal(meta)

	tx, err := s.Repo.DB.Beginx()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	_, err = tx.Exec(`INSERT INTO orders (id, tenant_id, user_id, guest_email, order_number, status, payment_status, fulfillment_status, currency, subtotal, discount, shipping_cost, tax_total, total, coupon_code, shipping_address, notes, metadata) VALUES ($1,$2,$3,$4,$5,'pending','unpaid','unfulfilled','UZS',$6,$7,$8,0,$9,$10,$11,$12,$13)`,
		id, in.TenantID, userID, guestEmail, number, subtotal, discountTotal, shippingCost, orderTotal, couponCode, in.ShippingAddress, in.Notes, metaJSON)
	if err != nil {
		return nil, err
	}
	commissionRate := 10.0
	_ = s.Repo.DB.Get(&commissionRate, `SELECT commission_rate FROM tenants WHERE id=$1`, in.TenantID)
	for _, line := range lines {
		lineTotal := float64(line.Quantity) * line.UnitPrice
		rate := commissionRate
		if line.VendorID != nil && *line.VendorID != "" {
			var vendorRate *float64
			_ = s.Repo.DB.Get(&vendorRate, `SELECT commission_rate FROM vendors WHERE id=$1 AND tenant_id=$2`, *line.VendorID, in.TenantID)
			if vendorRate != nil {
				rate = *vendorRate
			}
		}
		_, err = tx.Exec(`INSERT INTO order_items (id, order_id, tenant_id, vendor_id, product_id, variant_id, title, quantity, unit_price, total_price, commission_rate, commission_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			uuid.NewString(), id, in.TenantID, line.VendorID, line.ProductID, line.VariantID, line.Title, line.Quantity, line.UnitPrice, lineTotal, rate, lineTotal*rate/100)
		if err != nil {
			return nil, err
		}
		if line.VariantID != nil && *line.VariantID != "" {
			var avail int
			if err := tx.QueryRow(`SELECT inventory_quantity FROM product_variants WHERE id=$1 FOR UPDATE`, *line.VariantID).Scan(&avail); err != nil {
				return nil, fmt.Errorf("variant unavailable: %s", *line.VariantID)
			}
			if avail < line.Quantity {
				return nil, fmt.Errorf("insufficient stock for variant %s", *line.VariantID)
			}
			if _, err := tx.Exec(`UPDATE product_variants SET inventory_quantity=inventory_quantity-$1 WHERE id=$2`, line.Quantity, *line.VariantID); err != nil {
				return nil, err
			}
		}
		var productAvail int
		if err := tx.QueryRow(`SELECT inventory_quantity FROM products WHERE id=$1 FOR UPDATE`, line.ProductID).Scan(&productAvail); err != nil {
			return nil, fmt.Errorf("product unavailable: %s", line.ProductID)
		}
		if productAvail < line.Quantity {
			return nil, fmt.Errorf("insufficient stock for product %s", line.ProductID)
		}
		if _, err := tx.Exec(`UPDATE products SET inventory_quantity=inventory_quantity-$1, sales_count=sales_count+$1, status=CASE WHEN inventory_quantity-$1<=0 THEN 'out_of_stock' ELSE status END, updated_at=NOW() WHERE id=$2`, line.Quantity, line.ProductID); err != nil {
			return nil, err
		}
	}
	if couponCode != nil {
		if _, err := tx.Exec(`UPDATE coupons SET used_count=used_count+1 WHERE tenant_id=$1 AND code=$2`, in.TenantID, *couponCode); err != nil {
			return nil, err
		}
	}
	if cartMeta.GiftCertificateCode != nil && giftAmount > 0 {
		res, err := tx.Exec(`UPDATE gift_certificates SET balance=balance-$1, status=CASE WHEN balance-$1<=0 THEN 'redeemed' ELSE status END WHERE tenant_id=$2 AND code=$3 AND balance>=$1 AND status='active'`, giftAmount, in.TenantID, *cartMeta.GiftCertificateCode)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, fmt.Errorf("gift certificate unavailable")
		}
	}
	if _, err := tx.Exec(`UPDATE carts SET coupon_code=NULL, gift_certificate_code=NULL, updated_at=NOW() WHERE id=$1`, in.CartID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM cart_items WHERE cart_id=$1`, in.CartID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	_ = s.Producer.Publish(ctx, "order.created", id, map[string]any{"order_id": id, "total": orderTotal, "currency": "UZS", "tenant_id": in.TenantID, "user_id": userID, "status": "pending"})
	return map[string]any{
		"id":            id,
		"order_number":  number,
		"subtotal":      subtotal,
		"discount":      discountTotal,
		"shipping_cost": shippingCost,
		"total":         orderTotal,
		"status":        "pending",
		"payment_status": "unpaid",
	}, nil
}

func (s *OrderService) Transition(ctx context.Context, id, tenantID, status string) error {
	var current, orderTenant string
	var userID *string
	if err := s.Repo.DB.QueryRow(`SELECT status,user_id,tenant_id FROM orders WHERE id=$1 AND tenant_id=$2`, id, tenantID).Scan(&current, &userID, &orderTenant); err != nil {
		return err
	}
	if err := ValidateStatusTransition(current, status); err != nil {
		return err
	}
	fulfillment := map[string]string{"shipped": "shipped", "delivered": "fulfilled", "completed": "fulfilled", "cancelled": "cancelled"}[status]
	if fulfillment != "" {
		_, _ = s.Repo.DB.Exec(`UPDATE orders SET status=$1,fulfillment_status=$2,updated_at=NOW() WHERE id=$3 AND tenant_id=$4`, status, fulfillment, id, tenantID)
	} else {
		_, _ = s.Repo.DB.Exec(`UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, status, id, tenantID)
	}
	topic := "order.status_updated"
	if status == "shipped" {
		topic = "order.shipped"
	}
	return s.Producer.Publish(ctx, topic, id, map[string]any{"order_id": id, "status": status, "user_id": userID, "tenant_id": orderTenant})
}

func (s *OrderService) Refund(ctx context.Context, id, tenantID string) error {
	var paymentStatus string
	var userID *string
	if err := s.Repo.DB.QueryRow(
		`SELECT COALESCE(payment_status,'unpaid'), user_id FROM orders WHERE id=$1 AND tenant_id=$2`,
		id, tenantID,
	).Scan(&paymentStatus, &userID); err != nil {
		return err
	}
	if paymentStatus != "paid" && paymentStatus != "refunded" {
		return fmt.Errorf("only paid orders can be refunded")
	}
	if paymentStatus == "refunded" {
		return nil
	}
	if _, err := s.Repo.DB.Exec(
		`UPDATE orders SET payment_status='refunded', updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
		id, tenantID,
	); err != nil {
		return err
	}
	if _, err := s.Repo.DB.Exec(
		`UPDATE payments SET status='refunded', updated_at=NOW() WHERE order_id=$1 AND status='succeeded'`,
		id,
	); err != nil {
		return err
	}
	if os.Getenv("PAYMENTS_SANDBOX") == "false" {
		log.Printf("live PSP refund must be triggered for order %s", id)
	}
	return s.Producer.Publish(ctx, "order.refunded", id, map[string]any{
		"order_id": id, "tenant_id": tenantID, "user_id": userID, "payment_status": "refunded",
	})
}

func (s *OrderService) SetTracking(ctx context.Context, id, tenantID, carrier, number, trackingURL string) error {
	var status string
	if err := s.Repo.DB.Get(&status, `SELECT status FROM orders WHERE id=$1 AND tenant_id=$2`, id, tenantID); err != nil {
		return err
	}
	if status == "processing" {
		_, err := s.Repo.DB.Exec(`UPDATE orders SET tracking_carrier=$1, tracking_number=$2, tracking_url=$3, status='shipped', fulfillment_status='shipped', shipped_at=NOW(), updated_at=NOW() WHERE id=$4 AND tenant_id=$5`, carrier, number, nullableString(trackingURL), id, tenantID)
		if err == nil {
			_ = s.Producer.Publish(ctx, "order.shipped", id, map[string]any{"order_id": id, "status": "shipped", "tenant_id": tenantID})
		}
		return err
	}
	_, err := s.Repo.DB.Exec(`UPDATE orders SET tracking_carrier=$1, tracking_number=$2, tracking_url=$3, updated_at=NOW() WHERE id=$4 AND tenant_id=$5`, carrier, number, nullableString(trackingURL), id, tenantID)
	return err
}

func nullableString(v string) any {
	if v == "" {
		return nil
	}
	return v
}
