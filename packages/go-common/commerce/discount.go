package commerce

import "time"

// CouponSpec is enough data to compute a coupon discount.
type CouponSpec struct {
	Type      string
	Value     float64
	MinOrder  float64
	MaxUses   *int
	UsedCount int
	StartsAt  *time.Time
	EndsAt    *time.Time
	Status    string
}

// CouponDiscount returns the coupon amount applied to subtotal (never negative, never above subtotal).
func CouponDiscount(subtotal float64, c CouponSpec) float64 {
	if subtotal <= 0 || c.Status != "active" || subtotal < c.MinOrder {
		return 0
	}
	now := time.Now()
	if c.StartsAt != nil && now.Before(*c.StartsAt) {
		return 0
	}
	if c.EndsAt != nil && now.After(*c.EndsAt) {
		return 0
	}
	if c.MaxUses != nil && c.UsedCount >= *c.MaxUses {
		return 0
	}
	var discount float64
	if c.Type == "percent" {
		discount = subtotal * c.Value / 100
	} else {
		discount = c.Value
	}
	if discount < 0 {
		return 0
	}
	if discount > subtotal {
		return subtotal
	}
	return discount
}

// GiftApply returns how much of an active gift certificate balance applies to remaining.
func GiftApply(remaining, balance float64, status string) float64 {
	if remaining <= 0 || status != "active" || balance <= 0 {
		return 0
	}
	if balance > remaining {
		return remaining
	}
	return balance
}
