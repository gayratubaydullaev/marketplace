package model

import (
	"encoding/json"
	"time"
)

type Courier struct {
	ID          string     `db:"id" json:"id"`
	TenantID    string     `db:"tenant_id" json:"tenant_id"`
	UserID      string     `db:"user_id" json:"user_id"`
	FullName    string     `db:"full_name" json:"full_name"`
	Phone       string     `db:"phone" json:"phone"`
	Status      string     `db:"status" json:"status"`
	VehicleType string     `db:"vehicle_type" json:"vehicle_type"`
	LastLat     *float64   `db:"last_lat" json:"last_lat,omitempty"`
	LastLng     *float64   `db:"last_lng" json:"last_lng,omitempty"`
	LastSeenAt  *time.Time `db:"last_seen_at" json:"last_seen_at,omitempty"`
	RatingAvg   float64    `db:"rating_avg" json:"rating_avg"`
	RatingCount int        `db:"rating_count" json:"rating_count"`
	Email       string     `db:"email" json:"email,omitempty"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updated_at"`
	OnShift     bool       `db:"on_shift" json:"on_shift,omitempty"`
	ActiveJobs  int        `db:"active_jobs" json:"active_jobs,omitempty"`
}

type Shift struct {
	ID        string     `db:"id" json:"id"`
	TenantID  string     `db:"tenant_id" json:"tenant_id"`
	CourierID string     `db:"courier_id" json:"courier_id"`
	StartedAt time.Time  `db:"started_at" json:"started_at"`
	EndedAt   *time.Time `db:"ended_at" json:"ended_at,omitempty"`
	Status    string     `db:"status" json:"status"`
}

type Job struct {
	ID             string     `db:"id" json:"id"`
	TenantID       string     `db:"tenant_id" json:"tenant_id"`
	OrderID        string     `db:"order_id" json:"order_id"`
	CourierID      *string    `db:"courier_id" json:"courier_id,omitempty"`
	Status         string     `db:"status" json:"status"`
	PickupAddress  string     `db:"pickup_address" json:"pickup_address"`
	DropoffAddress string     `db:"dropoff_address" json:"dropoff_address"`
	PickupLat      *float64   `db:"pickup_lat" json:"pickup_lat,omitempty"`
	PickupLng      *float64   `db:"pickup_lng" json:"pickup_lng,omitempty"`
	DropoffLat     *float64   `db:"dropoff_lat" json:"dropoff_lat,omitempty"`
	DropoffLng     *float64   `db:"dropoff_lng" json:"dropoff_lng,omitempty"`
	CustomerName   string     `db:"customer_name" json:"customer_name"`
	CustomerPhone  string     `db:"customer_phone" json:"customer_phone"`
	VendorID       *string    `db:"vendor_id" json:"vendor_id,omitempty"`
	AssignedAt     *time.Time `db:"assigned_at" json:"assigned_at,omitempty"`
	AcceptedAt     *time.Time `db:"accepted_at" json:"accepted_at,omitempty"`
	PickedUpAt     *time.Time `db:"picked_up_at" json:"picked_up_at,omitempty"`
	DeliveredAt    *time.Time `db:"delivered_at" json:"delivered_at,omitempty"`
	Sequence       int        `db:"sequence" json:"sequence"`
	CODAmount          float64    `db:"cod_amount" json:"cod_amount"`
	CODCollectedAmount *float64   `db:"cod_collected_amount" json:"cod_collected_amount,omitempty"`
	CODDispute         bool       `db:"cod_dispute" json:"cod_dispute"`
	CODDisputeNote     string     `db:"cod_dispute_note" json:"cod_dispute_note,omitempty"`
	Metadata           json.RawMessage `db:"metadata" json:"metadata,omitempty"`
	DeliveryFee        float64    `db:"delivery_fee" json:"delivery_fee"`
	Currency           string     `db:"currency" json:"currency"`
	CreatedAt      time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at" json:"updated_at"`
	OrderNumber    string     `db:"order_number" json:"order_number,omitempty"`
	PaymentStatus  string     `db:"payment_status" json:"payment_status,omitempty"`
	CourierName    string     `db:"courier_name" json:"courier_name,omitempty"`
	CourierPhone   string     `db:"courier_phone" json:"courier_phone,omitempty"`
}

type Message struct {
	ID         string    `db:"id" json:"id"`
	TenantID   string    `db:"tenant_id" json:"tenant_id"`
	JobID      string    `db:"job_id" json:"job_id"`
	SenderRole string    `db:"sender_role" json:"sender_role"`
	SenderID   string    `db:"sender_id" json:"sender_id"`
	ToRole     string    `db:"to_role" json:"to_role"`
	Body       string    `db:"body" json:"body"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
}

type Rating struct {
	ID         string    `db:"id" json:"id"`
	TenantID   string    `db:"tenant_id" json:"tenant_id"`
	JobID      string    `db:"job_id" json:"job_id"`
	OrderID    string    `db:"order_id" json:"order_id"`
	CustomerID *string   `db:"customer_id" json:"customer_id,omitempty"`
	CourierID  string    `db:"courier_id" json:"courier_id"`
	Score      int       `db:"score" json:"score"`
	Comment    string    `db:"comment" json:"comment"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
}

type Payout struct {
	ID          string       `db:"id" json:"id"`
	TenantID    string       `db:"tenant_id" json:"tenant_id"`
	CourierID   string       `db:"courier_id" json:"courier_id"`
	PeriodStart string       `db:"period_start" json:"period_start"`
	PeriodEnd   string       `db:"period_end" json:"period_end"`
	Amount      float64      `db:"amount" json:"amount"`
	Currency    string       `db:"currency" json:"currency"`
	Status      string       `db:"status" json:"status"`
	PaidAt      *time.Time   `db:"paid_at" json:"paid_at,omitempty"`
	Note        string       `db:"note" json:"note"`
	CreatedAt   time.Time    `db:"created_at" json:"created_at"`
	CourierName string       `db:"courier_name" json:"courier_name,omitempty"`
	Items       []PayoutItem `json:"items,omitempty"`
}

type PayoutItem struct {
	ID      string  `db:"id" json:"id"`
	PayoutID string `db:"payout_id" json:"payout_id"`
	JobID   string  `db:"job_id" json:"job_id"`
	Amount  float64 `db:"amount" json:"amount"`
	OrderID string  `db:"order_id" json:"order_id,omitempty"`
}
