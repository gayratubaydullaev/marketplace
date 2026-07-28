package service

import (
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"net/url"
	"strings"
	"testing"
)

func TestPaymeCheckoutURL(t *testing.T) {
	t.Setenv("PAYMENTS_SANDBOX", "true")
	u := PaymeCheckoutURL("merchant123", 1500, "order-1", "payme_abc", "http://localhost:3000/uz/orders/order-1/payment-return")
	if !strings.HasPrefix(u, "https://checkout.paycom.uz/") && !strings.HasPrefix(u, "https://test.paycom.uz/") {
		t.Fatalf("unexpected host: %s", u)
	}
	encoded := u[strings.LastIndex(u, "/")+1:]
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, want := range []string{"m=merchant123", "ac.order_id=order-1", "ac.payment_id=payme_abc", "a=150000"} {
		if !strings.Contains(s, want) {
			t.Fatalf("missing %s in %s", want, s)
		}
	}
}

func TestParseClickForm(t *testing.T) {
	secret := "click-secret"
	values := url.Values{
		"click_trans_id":    {"99"},
		"service_id":        {"1"},
		"merchant_trans_id": {"click_abc"},
		"amount":            {"1000"},
		"action":            {"1"},
		"sign_time":         {"2024-01-01"},
	}
	raw := values.Get("click_trans_id") + values.Get("service_id") + secret + values.Get("merchant_trans_id") + values.Get("amount") + values.Get("action") + values.Get("sign_time")
	sum := md5.Sum([]byte(raw))
	values.Set("sign_string", hex.EncodeToString(sum[:]))
	id, status, err := ParseClickForm([]byte(values.Encode()), secret)
	if err != nil {
		t.Fatal(err)
	}
	if id != "click_abc" || status != "succeeded" {
		t.Fatalf("got %s %s", id, status)
	}
}

func TestVerifyPaymeAuth(t *testing.T) {
	secret := "cashbox-key"
	cred := "Basic " + base64.StdEncoding.EncodeToString([]byte("Paycom:"+secret))
	if !VerifyPaymeAuth(cred, secret) {
		t.Fatal("expected auth ok")
	}
	if VerifyPaymeAuth(cred, "wrong") {
		t.Fatal("expected auth fail")
	}
}
