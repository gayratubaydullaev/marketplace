package service

import "testing"

func TestValidateStatusTransition(t *testing.T) {
	for _, transition := range [][2]string{
		{"pending", "confirmed"},
		{"pending", "cancelled"},
		{"confirmed", "refunded"},
		{"processing", "returned"},
		{"delivered", "completed"},
	} {
		if err := ValidateStatusTransition(transition[0], transition[1]); err != nil {
			t.Fatalf("%s -> %s rejected: %v", transition[0], transition[1], err)
		}
	}

	if err := ValidateStatusTransition("pending", "shipped"); err == nil {
		t.Fatal("pending -> shipped must be rejected")
	}
}
