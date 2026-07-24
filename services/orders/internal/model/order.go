package model

import (
	"encoding/json"
	"time"
)

type Order struct {
	ID                string          `db:"id" json:"id"`
	TenantID          string          `db:"tenant_id" json:"tenant_id"`
	UserID            *string         `db:"user_id" json:"user_id"`
	GuestEmail        *string         `db:"guest_email" json:"guest_email"`
	OrderNumber       string          `db:"order_number" json:"order_number"`
	Status            string          `db:"status" json:"status"`
	PaymentStatus     string          `db:"payment_status" json:"payment_status"`
	FulfillmentStatus string          `db:"fulfillment_status" json:"fulfillment_status"`
	Currency          string          `db:"currency" json:"currency"`
	Subtotal          float64         `db:"subtotal" json:"subtotal"`
	Discount          float64         `db:"discount" json:"discount"`
	ShippingCost      float64         `db:"shipping_cost" json:"shipping_cost"`
	TaxTotal          float64         `db:"tax_total" json:"tax_total"`
	Total             float64         `db:"total" json:"total"`
	CouponCode        *string         `db:"coupon_code" json:"coupon_code"`
	ShippingAddress   json.RawMessage `db:"shipping_address" json:"shipping_address"`
	Notes             *string         `db:"notes" json:"notes"`
	TrackingCarrier   *string         `db:"tracking_carrier" json:"tracking_carrier,omitempty"`
	TrackingNumber    *string         `db:"tracking_number" json:"tracking_number,omitempty"`
	TrackingURL       *string         `db:"tracking_url" json:"tracking_url,omitempty"`
	ShippedAt         *time.Time      `db:"shipped_at" json:"shipped_at,omitempty"`
	CreatedAt         time.Time       `db:"created_at" json:"created_at"`
}

type OrderReturn struct {
	ID        string     `db:"id" json:"id"`
	TenantID  string     `db:"tenant_id" json:"tenant_id"`
	OrderID   string     `db:"order_id" json:"order_id"`
	UserID    *string    `db:"user_id" json:"user_id,omitempty"`
	Reason    string     `db:"reason" json:"reason"`
	Status    string     `db:"status" json:"status"`
	AdminNote *string    `db:"admin_note" json:"admin_note,omitempty"`
	CreatedAt time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt time.Time  `db:"updated_at" json:"updated_at"`
}

type OrderItem struct {
	ID               string  `db:"id" json:"id"`
	OrderID          string  `db:"order_id" json:"order_id"`
	VendorID         *string `db:"vendor_id" json:"vendor_id"`
	ProductID        string  `db:"product_id" json:"product_id"`
	Title            string  `db:"title" json:"title"`
	Quantity         int     `db:"quantity" json:"quantity"`
	UnitPrice        float64 `db:"unit_price" json:"unit_price"`
	TotalPrice       float64 `db:"total_price" json:"total_price"`
	CommissionRate   float64 `db:"commission_rate" json:"commission_rate"`
	CommissionAmount float64 `db:"commission_amount" json:"commission_amount"`
	Status           string  `db:"status" json:"status"`
}
