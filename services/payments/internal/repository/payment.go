package repository

import (
	commondb "github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/services/payments/internal/model"
	"github.com/jmoiron/sqlx"
)

type PaymentRepository struct{ DB *sqlx.DB }

func NewPaymentRepository(db *sqlx.DB) *PaymentRepository { return &PaymentRepository{DB: db} }

const paymentCols = `id,tenant_id,order_id,user_id,amount,currency,provider,provider_payment_id,status,created_at`

func (r *PaymentRepository) Find(id string) (model.Payment, error) {
	var p model.Payment
	err := commondb.WithRLSBypass(r.DB, func(tx *sqlx.Tx) error {
		return tx.Get(&p, `SELECT `+paymentCols+` FROM payments WHERE id=$1`, id)
	})
	return p, err
}
func (r *PaymentRepository) FindInTenant(id, tenantID string) (model.Payment, error) {
	var p model.Payment
	err := commondb.WithTenant(r.DB, tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&p, `SELECT `+paymentCols+` FROM payments WHERE id=$1 AND tenant_id=$2`, id, tenantID)
	})
	return p, err
}
func (r *PaymentRepository) FindByProviderID(id string) (model.Payment, error) {
	var p model.Payment
	err := commondb.WithRLSBypass(r.DB, func(tx *sqlx.Tx) error {
		return tx.Get(&p, `SELECT `+paymentCols+` FROM payments WHERE provider_payment_id=$1 LIMIT 1`, id)
	})
	return p, err
}

// FindPaymeAccount resolves Payme account.order_id / account.payment_id to a pending/succeeded payment.
func (r *PaymentRepository) FindPaymeAccount(accountKey string) (model.Payment, error) {
	var p model.Payment
	err := commondb.WithRLSBypass(r.DB, func(tx *sqlx.Tx) error {
		return tx.Get(&p, `
			SELECT `+paymentCols+`
			FROM payments
			WHERE provider='payme' AND (provider_payment_id=$1 OR order_id::text=$1 OR id::text=$1)
			ORDER BY created_at DESC LIMIT 1`, accountKey)
	})
	return p, err
}

func (r *PaymentRepository) FindClickMerchant(merchantTransID string) (model.Payment, error) {
	var p model.Payment
	err := commondb.WithRLSBypass(r.DB, func(tx *sqlx.Tx) error {
		return tx.Get(&p, `
			SELECT `+paymentCols+`
			FROM payments
			WHERE provider='click' AND (provider_payment_id=$1 OR order_id::text=$1 OR id::text=$1)
			ORDER BY created_at DESC LIMIT 1`, merchantTransID)
	})
	return p, err
}
func (r *PaymentRepository) ListForOrder(orderID, tenantID string) ([]model.Payment, error) {
	var items []model.Payment
	err := commondb.WithTenant(r.DB, tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&items, `SELECT `+paymentCols+` FROM payments WHERE order_id=$1 AND tenant_id=$2`, orderID, tenantID)
	})
	return items, err
}
