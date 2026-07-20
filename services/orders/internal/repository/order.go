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
	q := `SELECT id, tenant_id, user_id, guest_email, order_number, status, COALESCE(payment_status,'unpaid') AS payment_status, COALESCE(fulfillment_status,'unfulfilled') AS fulfillment_status, currency, subtotal, discount, shipping_cost, COALESCE(tax_total,0) AS tax_total, total, coupon_code, shipping_address, notes, created_at FROM orders WHERE tenant_id=$1`
	args := []any{tenantID}
	if customerOnly {
		q += ` AND user_id=$2`
		args = append(args, userID)
	}
	q += ` ORDER BY created_at DESC LIMIT 50`
	return orders, r.DB.Select(&orders, q, args...)
}

func (r *OrderRepository) Get(id, tenantID string) (model.Order, []model.OrderItem, error) {
	var order model.Order
	err := r.DB.Get(&order, `SELECT id, tenant_id, user_id, guest_email, order_number, status, COALESCE(payment_status,'unpaid') AS payment_status, COALESCE(fulfillment_status,'unfulfilled') AS fulfillment_status, currency, subtotal, discount, shipping_cost, COALESCE(tax_total,0) AS tax_total, total, coupon_code, shipping_address, notes, created_at FROM orders WHERE id=$1 AND tenant_id=$2`, id, tenantID)
	if err != nil {
		return order, nil, err
	}
	var items []model.OrderItem
	err = r.DB.Select(&items, `SELECT id, order_id, vendor_id, product_id, title, quantity, unit_price, total_price, commission_rate, commission_amount, status FROM order_items WHERE order_id=$1`, order.ID)
	return order, items, err
}
