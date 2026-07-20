package repository

import (
	"github.com/gayrat/marketplace/services/payments/internal/model"
	"github.com/jmoiron/sqlx"
)

type PaymentRepository struct{ DB *sqlx.DB }

func NewPaymentRepository(db *sqlx.DB) *PaymentRepository { return &PaymentRepository{DB: db} }

func (r *PaymentRepository) Find(id string) (model.Payment, error) {
	var p model.Payment
	return p, r.DB.Get(&p, `SELECT id,tenant_id,order_id,user_id,amount,currency,provider,provider_payment_id,status,created_at FROM payments WHERE id=$1`, id)
}
func (r *PaymentRepository) FindByProviderID(id string) (model.Payment, error) {
	var p model.Payment
	return p, r.DB.Get(&p, `SELECT id,tenant_id,order_id,user_id,amount,currency,provider,provider_payment_id,status,created_at FROM payments WHERE provider_payment_id=$1 LIMIT 1`, id)
}
func (r *PaymentRepository) ListForOrder(orderID string) ([]model.Payment, error) {
	var items []model.Payment
	return items, r.DB.Select(&items, `SELECT id,tenant_id,order_id,user_id,amount,currency,provider,provider_payment_id,status,created_at FROM payments WHERE order_id=$1`, orderID)
}
