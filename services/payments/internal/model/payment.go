package model

import "time"

type Payment struct {
	ID                string    `db:"id" json:"id"`
	TenantID          string    `db:"tenant_id" json:"tenant_id"`
	OrderID           string    `db:"order_id" json:"order_id"`
	UserID            *string   `db:"user_id" json:"user_id"`
	Amount            float64   `db:"amount" json:"amount"`
	Currency          string    `db:"currency" json:"currency"`
	Provider          string    `db:"provider" json:"provider"`
	ProviderPaymentID string    `db:"provider_payment_id" json:"provider_payment_id"`
	Status            string    `db:"status" json:"status"`
	CreatedAt         time.Time `db:"created_at" json:"created_at"`
}
