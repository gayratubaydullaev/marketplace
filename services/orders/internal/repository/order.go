package repository

import (
	"github.com/gayrat/marketplace/services/orders/internal/model"
	"github.com/jmoiron/sqlx"
)

type OrderRepository struct {
	DB *sqlx.DB
}

func NewOrderRepository(db *sqlx.DB) *OrderRepository {
	return &OrderRepository{DB: db}
}

func (r *OrderRepository) List(tenantID, userID string, customerOnly bool) ([]model.Order, error) {
	var orders []model.Order
	q := `SELECT id, tenant_id, user_id, guest_email, order_number, status, COALESCE(payment_status,'unpaid') AS payment_status, COALESCE(payment_method,'') AS payment_method, COALESCE(fulfillment_status,'unfulfilled') AS fulfillment_status, currency, subtotal, discount, shipping_cost, COALESCE(tax_total,0) AS tax_total, total, coupon_code, shipping_address, notes, tracking_carrier, tracking_number, tracking_url, shipped_at, created_at FROM orders WHERE tenant_id=$1`
	args := []any{tenantID}
	if customerOnly {
		q += ` AND user_id=$2`
		args = append(args, userID)
	}
	q += ` ORDER BY created_at DESC LIMIT 50`
	return orders, r.DB.Select(&orders, q, args...)
}

func (r *OrderRepository) ListByVendor(tenantID, vendorID string) ([]model.Order, error) {
	var orders []model.Order
	err := r.DB.Select(&orders, `
		SELECT DISTINCT o.id, o.tenant_id, o.user_id, o.guest_email, o.order_number, o.status,
		       COALESCE(o.payment_status,'unpaid') AS payment_status,
		       COALESCE(o.payment_method,'') AS payment_method,
		       COALESCE(o.fulfillment_status,'unfulfilled') AS fulfillment_status,
		       o.currency, o.subtotal, o.discount, o.shipping_cost, COALESCE(o.tax_total,0) AS tax_total, o.total,
		       o.coupon_code, o.shipping_address, o.notes, o.tracking_carrier, o.tracking_number, o.tracking_url, o.shipped_at, o.created_at
		FROM orders o
		INNER JOIN order_items oi ON oi.order_id = o.id
		WHERE o.tenant_id=$1 AND oi.vendor_id::text=$2
		ORDER BY o.created_at DESC
		LIMIT 50`, tenantID, vendorID)
	return orders, err
}

func (r *OrderRepository) ListByCourier(tenantID, courierID string) ([]model.Order, error) {
	var orders []model.Order
	err := r.DB.Select(&orders, `
		SELECT o.id, o.tenant_id, o.user_id, o.guest_email, o.order_number, o.status,
		       COALESCE(o.payment_status,'unpaid') AS payment_status,
		       COALESCE(o.payment_method,'') AS payment_method,
		       COALESCE(o.fulfillment_status,'unfulfilled') AS fulfillment_status,
		       o.currency, o.subtotal, o.discount, o.shipping_cost, COALESCE(o.tax_total,0) AS tax_total, o.total,
		       o.coupon_code, o.shipping_address, o.notes, o.tracking_carrier, o.tracking_number, o.tracking_url, o.shipped_at, o.created_at
		FROM orders o
		INNER JOIN delivery_jobs d ON d.order_id = o.id AND d.tenant_id = o.tenant_id
		WHERE o.tenant_id=$1 AND d.courier_id::text=$2
		  AND d.status IN ('assigned','accepted','at_pickup','picked_up','in_transit')
		ORDER BY o.created_at DESC
		LIMIT 50`, tenantID, courierID)
	return orders, err
}

func (r *OrderRepository) ListByGuest(tenantID, guestID string) ([]model.Order, error) {
	var orders []model.Order
	err := r.DB.Select(&orders, `
		SELECT id, tenant_id, user_id, guest_email, order_number, status,
		       COALESCE(payment_status,'unpaid') AS payment_status,
		       COALESCE(payment_method,'') AS payment_method,
		       COALESCE(fulfillment_status,'unfulfilled') AS fulfillment_status,
		       currency, subtotal, discount, shipping_cost, COALESCE(tax_total,0) AS tax_total, total,
		       coupon_code, shipping_address, notes, tracking_carrier, tracking_number, tracking_url, shipped_at, created_at
		FROM orders
		WHERE tenant_id=$1 AND user_id IS NULL AND COALESCE(metadata->>'guest_id','')=$2
		ORDER BY created_at DESC
		LIMIT 50`, tenantID, guestID)
	return orders, err
}

func (r *OrderRepository) GetByNumber(orderNumber, tenantID string) (model.Order, []model.OrderItem, error) {
	var order model.Order
	err := r.DB.Get(&order, `
		SELECT id, tenant_id, user_id, guest_email, order_number, status,
		       COALESCE(payment_status,'unpaid') AS payment_status,
		       COALESCE(payment_method,'') AS payment_method,
		       COALESCE(fulfillment_status,'unfulfilled') AS fulfillment_status,
		       currency, subtotal, discount, shipping_cost, COALESCE(tax_total,0) AS tax_total, total,
		       coupon_code, shipping_address, notes, tracking_carrier, tracking_number, tracking_url, shipped_at, created_at
		FROM orders WHERE order_number=$1 AND tenant_id=$2`, orderNumber, tenantID)
	if err != nil {
		return order, nil, err
	}
	var items []model.OrderItem
	err = r.DB.Select(&items, `SELECT id, order_id, vendor_id, product_id, title, quantity, unit_price, total_price, commission_rate, commission_amount, status FROM order_items WHERE order_id=$1`, order.ID)
	return order, items, err
}

func (r *OrderRepository) Get(id, tenantID string) (model.Order, []model.OrderItem, error) {
	var order model.Order
	err := r.DB.Get(&order, `SELECT id, tenant_id, user_id, guest_email, order_number, status, COALESCE(payment_status,'unpaid') AS payment_status, COALESCE(payment_method,'') AS payment_method, COALESCE(fulfillment_status,'unfulfilled') AS fulfillment_status, currency, subtotal, discount, shipping_cost, COALESCE(tax_total,0) AS tax_total, total, coupon_code, shipping_address, notes, tracking_carrier, tracking_number, tracking_url, shipped_at, created_at FROM orders WHERE id=$1 AND tenant_id=$2`, id, tenantID)
	if err != nil {
		return order, nil, err
	}
	var items []model.OrderItem
	err = r.DB.Select(&items, `SELECT id, order_id, vendor_id, product_id, title, quantity, unit_price, total_price, commission_rate, commission_amount, status FROM order_items WHERE order_id=$1`, order.ID)
	return order, items, err
}
