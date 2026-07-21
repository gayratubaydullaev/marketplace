package service

import (
	"strings"
	"testing"
)

func TestStripeProviderSandbox(t *testing.T) {
	t.Setenv("PAYMENTS_SANDBOX", "true")
	provider := StripeProvider{Secret: "sandbox-secret"}

	id, redirect, err := provider.CreateIntent(12_500, "UZS", "order-123")
	if err != nil {
		t.Fatalf("CreateIntent() error = %v", err)
	}
	if !strings.HasPrefix(id, "stripe_") || !strings.Contains(redirect, "checkout.stripe.com") {
		t.Fatalf("unexpected sandbox intent: id=%q redirect=%q", id, redirect)
	}

	gotID, status, err := provider.VerifyWebhook([]byte(`{"id":"pi_sandbox","status":"succeeded"}`), "sandbox")
	if err != nil || gotID != "pi_sandbox" || status != "succeeded" {
		t.Fatalf("sandbox webhook = (%q, %q, %v)", gotID, status, err)
	}
}
