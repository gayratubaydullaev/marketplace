package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestHMACProviderVerifySandbox(t *testing.T) {
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
