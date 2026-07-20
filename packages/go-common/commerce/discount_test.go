package commerce

import (
	"testing"
	"time"
)

func TestCouponDiscount(t *testing.T) {
	active := CouponSpec{Type: "percent", Value: 10, Status: "active"}
	if got := CouponDiscount(100_000, active); got != 10_000 {
		t.Fatalf("percent: got %v", got)
	}
	fixed := CouponSpec{Type: "fixed", Value: 5_000, Status: "active"}
	if got := CouponDiscount(100_000, fixed); got != 5_000 {
		t.Fatalf("fixed: got %v", got)
	}
	min := CouponSpec{Type: "fixed", Value: 5_000, MinOrder: 200_000, Status: "active"}
	if got := CouponDiscount(100_000, min); got != 0 {
		t.Fatalf("min order: got %v", got)
	}
	expired := CouponSpec{Type: "fixed", Value: 5_000, Status: "active", EndsAt: ptrTime(time.Now().Add(-time.Hour))}
	if got := CouponDiscount(100_000, expired); got != 0 {
		t.Fatalf("expired: got %v", got)
	}
}

func TestGiftApply(t *testing.T) {
	if got := GiftApply(10_000, 50_000, "active"); got != 10_000 {
		t.Fatalf("cap remaining: %v", got)
	}
	if got := GiftApply(50_000, 10_000, "active"); got != 10_000 {
		t.Fatalf("use balance: %v", got)
	}
	if got := GiftApply(10_000, 50_000, "disabled"); got != 0 {
		t.Fatalf("inactive: %v", got)
	}
}

func ptrTime(t time.Time) *time.Time { return &t }
