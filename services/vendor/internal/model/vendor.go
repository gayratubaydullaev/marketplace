package model

import (
	"encoding/json"
	"time"
)

type Vendor struct {
	ID             string          `db:"id" json:"id"`
	TenantID       string          `db:"tenant_id" json:"tenant_id"`
	UserID         string          `db:"user_id" json:"user_id"`
	Name           string          `db:"name" json:"name"`
	Slug           string          `db:"slug" json:"slug"`
	Description    *string         `db:"description" json:"description"`
	Translations   json.RawMessage `db:"translations" json:"translations"`
	LogoURL        *string         `db:"logo_url" json:"logo_url"`
	BannerURL      *string         `db:"banner_url" json:"banner_url"`
	CommissionRate *float64        `db:"commission_rate" json:"commission_rate"`
	Status         string          `db:"status" json:"status"`
	KYCVerified    bool            `db:"kyc_verified" json:"kyc_verified"`
	KYCStatus      string          `db:"kyc_status" json:"kyc_status"`
	Rating         float64         `db:"rating" json:"rating"`
	ReviewCount    int             `db:"review_count" json:"review_count"`
	CreatedAt      time.Time       `db:"created_at" json:"created_at"`
}
