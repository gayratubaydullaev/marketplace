package model

import "encoding/json"

type Product struct {
	ID string `db:"id" json:"id"`; TenantID string `db:"tenant_id" json:"tenant_id"`
	Translations json.RawMessage `db:"translations" json:"translations"`
	Price float64 `db:"price" json:"price"`; Currency string `db:"currency" json:"currency"`
}
