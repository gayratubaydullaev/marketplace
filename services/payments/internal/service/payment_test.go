package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestHMACProviderVerifySandbox(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("PAYMENTS_SANDBOX", "true")
	p := HMACProvider{NameValue: "payme", Secret: "payme-sandbox-secret"}
	body := []byte(`{"id":"payme_abc","status":"succeeded"}`)
	mac := hmac.New(sha256.New, []byte(p.Secret))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))
	id, status, err := p.VerifyWebhook(body, sig)
	if err != nil {
		t.Fatal(err)
	}
	if id != "payme_abc" || status != "succeeded" {
		t.Fatalf("got %s %s", id, status)
	}
	// sandbox shortcut signature
	id2, _, err := p.VerifyWebhook(body, "sandbox")
	if err != nil || id2 != "payme_abc" {
		t.Fatalf("sandbox sig failed: %v %s", err, id2)
	}
}

func TestValidateProviderSecretsSandboxOK(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("PAYMENTS_SANDBOX", "true")
	t.Setenv("PAYME_SECRET", "")
	t.Setenv("CLICK_SECRET", "")
	t.Setenv("UZUM_SECRET", "")
	t.Setenv("STRIPE_SECRET", "")
	if err := ValidateProviderSecrets(); err != nil {
		t.Fatal(err)
	}
}

func TestSandboxFailClosedEmptyEnv(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("PAYMENTS_SANDBOX", "")
	if Sandbox() {
		t.Fatal("empty APP_ENV must not enable sandbox")
	}
	t.Setenv("PAYMENTS_SANDBOX", "true")
	if !Sandbox() {
		t.Fatal("explicit PAYMENTS_SANDBOX=true should enable sandbox even with empty APP_ENV")
	}
}

func TestValidateProviderSecretsLiveRequires(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("PAYMENTS_SANDBOX", "false")
	t.Setenv("PAYME_SECRET", "")
	t.Setenv("CLICK_SECRET", "")
	t.Setenv("UZUM_SECRET", "")
	t.Setenv("STRIPE_SECRET", "")
	if err := ValidateProviderSecrets(); err == nil {
		t.Fatal("expected error when live secrets missing")
	}
}
