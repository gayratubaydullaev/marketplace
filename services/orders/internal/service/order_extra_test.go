package service

import "testing"

func TestStatusTransitionRejectsBad(t *testing.T) {
	if err := ValidateStatusTransition("cancelled", "confirmed"); err == nil {
		t.Fatal("cancelled -> confirmed must fail")
	}
}
