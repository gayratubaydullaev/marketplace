package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Sandbox is deliberately opt-out so local and preview deployments cannot
// accidentally initiate a live payment.
func Sandbox() bool { return os.Getenv("PAYMENTS_SANDBOX") != "false" }

type Provider interface {
	Name() string
	CreateIntent(float64, string, string) (string, string, error)
	VerifyWebhook([]byte, string) (string, string, error)
}

type HMACProvider struct{ NameValue, MerchantID, Secret, RedirectTemplate string }

func (p HMACProvider) Name() string { return p.NameValue }
func (p HMACProvider) CreateIntent(amount float64, currency, orderID string) (string, string, error) {
	id := p.NameValue + "_" + uuid.NewString()[:12]
	return id, fmt.Sprintf(p.RedirectTemplate, p.MerchantID, amount, orderID, id), nil
}
func (p HMACProvider) VerifyWebhook(payload []byte, signature string) (string, string, error) {
	if err := verifyHMAC(payload, signature, p.Secret); err != nil {
		return "", "", err
	}
	return webhookResult(payload)
}

func verifyHMAC(payload []byte, signature, secret string) error {
	if Sandbox() && (signature == "" || signature == "sandbox") {
		return nil
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return fmt.Errorf("invalid signature")
	}
	return nil
}

func webhookResult(payload []byte) (string, string, error) {
	var body map[string]any
	if err := json.Unmarshal(payload, &body); err != nil {
		return "", "", fmt.Errorf("invalid webhook payload: %w", err)
	}
	id := stringValue(body, "id", "click_trans_id", "provider_payment_id", "payment_id")
	if id == "" {
		if params, ok := body["params"].(map[string]any); ok {
			id = stringValue(params, "id", "transaction_id", "provider_payment_id")
		}
	}
	if id == "" {
		return "", "", fmt.Errorf("webhook payment id missing")
	}
	status := stringValue(body, "status", "state")
	if status == "" {
		status = "succeeded"
	}
	return id, status, nil
}

func stringValue(body map[string]any, keys ...string) string {
	for _, key := range keys {
		switch value := body[key].(type) {
		case string:
			if value != "" {
				return value
			}
		case float64:
			return strconv.FormatInt(int64(value), 10)
		}
	}
	return ""
}

// PaymeProvider uses Payme's checkout and merchant credentials in production.
type PaymeProvider struct{ MerchantID, Secret string }

func (p PaymeProvider) Name() string { return "payme" }
func (p PaymeProvider) CreateIntent(amount float64, _ string, orderID string) (string, string, error) {
	id := "payme_" + uuid.NewString()[:12]
	q := url.Values{
		"amount":      {strconv.FormatInt(int64(amount*100), 10)}, // tiyin
		"account[order_id]": {orderID},
		"transaction": {id},
	}
	return id, "https://checkout.paycom.uz/" + p.MerchantID + "?" + q.Encode(), nil
}
func (p PaymeProvider) VerifyWebhook(payload []byte, credential string) (string, string, error) {
	if Sandbox() {
		if err := verifyHMAC(payload, credential, p.Secret); err != nil {
			return "", "", err
		}
	} else if !verifyBasicOrToken(credential, p.MerchantID, p.Secret) {
		return "", "", fmt.Errorf("invalid Payme authorization")
	}
	return webhookResult(payload)
}

type ClickProvider struct{ MerchantID, Secret string }

func (p ClickProvider) Name() string { return "click" }
func (p ClickProvider) CreateIntent(amount float64, _ string, orderID string) (string, string, error) {
	id := "click_" + uuid.NewString()[:12]
	q := url.Values{"service_id": {p.MerchantID}, "amount": {strconv.FormatInt(int64(amount), 10)}, "transaction_param": {orderID}, "payment_id": {id}}
	return id, "https://my.click.uz/services/pay?" + q.Encode(), nil
}
func (p ClickProvider) VerifyWebhook(payload []byte, credential string) (string, string, error) {
	if Sandbox() {
		if err := verifyHMAC(payload, credential, p.Secret); err != nil {
			return "", "", err
		}
	} else if !verifyBasicOrToken(credential, p.MerchantID, p.Secret) {
		return "", "", fmt.Errorf("invalid Click authorization")
	}
	return webhookResult(payload)
}

type UzumProvider struct{ MerchantID, Secret string }

func (p UzumProvider) Name() string { return "uzum" }
func (p UzumProvider) CreateIntent(amount float64, _ string, orderID string) (string, string, error) {
	id := "uzum_" + uuid.NewString()[:12]
	q := url.Values{"amount": {strconv.FormatInt(int64(amount), 10)}, "order": {orderID}, "id": {id}}
	return id, "https://www.uzumbank.uz/pay/" + url.PathEscape(p.MerchantID) + "?" + q.Encode(), nil
}
func (p UzumProvider) VerifyWebhook(payload []byte, credential string) (string, string, error) {
	if Sandbox() {
		if err := verifyHMAC(payload, credential, p.Secret); err != nil {
			return "", "", err
		}
	} else if !verifyBasicOrToken(credential, p.MerchantID, p.Secret) {
		return "", "", fmt.Errorf("invalid Uzum authorization")
	}
	return webhookResult(payload)
}

func verifyBasicOrToken(credential, merchantID, secret string) bool {
	credential = strings.TrimSpace(credential)
	if strings.HasPrefix(strings.ToLower(credential), "basic ") {
		raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(credential[6:]))
		if err != nil {
			return false
		}
		return hmac.Equal(raw, []byte(merchantID+":"+secret)) || hmac.Equal(raw, []byte(":"+secret))
	}
	credential = strings.TrimPrefix(credential, "Bearer ")
	return credential != "" && hmac.Equal([]byte(credential), []byte(secret))
}

type StripeProvider struct{ Secret, WebhookSecret string }

func (p StripeProvider) Name() string { return "stripe" }
func (p StripeProvider) CreateIntent(amount float64, currency, orderID string) (string, string, error) {
	if Sandbox() {
		return HMACProvider{NameValue: "stripe", MerchantID: "stripe", Secret: p.Secret, RedirectTemplate: "https://checkout.stripe.com/pay/%s?amount=%.0f&order=%s&pi=%s"}.CreateIntent(amount, currency, orderID)
	}
	form := url.Values{"amount": {strconv.FormatInt(int64(amount*100), 10)}, "currency": {strings.ToLower(currency)}, "metadata[order_id]": {orderID}}
	req, err := http.NewRequest(http.MethodPost, "https://api.stripe.com/v1/payment_intents", strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", err
	}
	req.SetBasicAuth(p.Secret, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return "", "", fmt.Errorf("stripe payment intent: %s", strings.TrimSpace(string(data)))
	}
	var intent struct {
		ID           string `json:"id"`
		ClientSecret string `json:"client_secret"`
	}
	if err := json.Unmarshal(data, &intent); err != nil || intent.ID == "" || intent.ClientSecret == "" {
		return "", "", fmt.Errorf("invalid Stripe payment intent response")
	}
	return intent.ID, intent.ClientSecret, nil
}
func (p StripeProvider) VerifyWebhook(payload []byte, signature string) (string, string, error) {
	if Sandbox() {
		if err := verifyHMAC(payload, signature, p.Secret); err != nil {
			return "", "", err
		}
		return webhookResult(payload)
	}
	if !verifyStripeSignature(payload, signature, firstSet(p.WebhookSecret, p.Secret)) {
		return "", "", fmt.Errorf("invalid Stripe-Signature")
	}
	var event struct {
		Type string `json:"type"`
		Data struct {
			Object struct {
				ID     string `json:"id"`
				Status string `json:"status"`
			} `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(payload, &event); err != nil || event.Data.Object.ID == "" {
		return "", "", fmt.Errorf("invalid Stripe webhook")
	}
	status := event.Data.Object.Status
	if event.Type == "payment_intent.succeeded" {
		status = "succeeded"
	}
	return event.Data.Object.ID, status, nil
}

func verifyStripeSignature(payload []byte, signature, secret string) bool {
	var timestamp, supplied string
	for _, part := range strings.Split(signature, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		if key == "t" {
			timestamp = value
		}
		if key == "v1" {
			supplied = value
		}
	}
	if timestamp == "" || supplied == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp + "." + string(payload)))
	expected, err := hex.DecodeString(hex.EncodeToString(mac.Sum(nil)))
	if err != nil {
		return false
	}
	got, err := hex.DecodeString(supplied)
	return err == nil && hmac.Equal(expected, got)
}

// StripeConnectAccountID reads the account chosen for a vendor split. The
// returned value is persisted in payment metadata by the intent handler.
func StripeConnectAccountID(metadata map[string]any) string {
	for _, key := range []string{"stripe_connected_account_id", "connected_account_id", "stripe_account_id"} {
		if value, ok := metadata[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}

type PayPalProvider struct{ ClientID, ClientSecret string }

func (p PayPalProvider) Name() string { return "paypal" }
func (p PayPalProvider) CreateIntent(amount float64, currency, orderID string) (string, string, error) {
	base := "https://api-m.paypal.com"
	if Sandbox() {
		base = "https://api-m.sandbox.paypal.com"
	}
	tokenReq, _ := http.NewRequest(http.MethodPost, base+"/v1/oauth2/token", strings.NewReader("grant_type=client_credentials"))
	tokenReq.SetBasicAuth(p.ClientID, p.ClientSecret)
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 15 * time.Second}
	tokenResp, err := client.Do(tokenReq)
	if err != nil {
		return "", "", err
	}
	defer tokenResp.Body.Close()
	tokenBody, _ := io.ReadAll(tokenResp.Body)
	if tokenResp.StatusCode/100 != 2 {
		return "", "", fmt.Errorf("PayPal access token: %s", strings.TrimSpace(string(tokenBody)))
	}
	var token struct{ AccessToken string `json:"access_token"` }
	if json.Unmarshal(tokenBody, &token) != nil || token.AccessToken == "" {
		return "", "", fmt.Errorf("invalid PayPal access token response")
	}
	payload, _ := json.Marshal(map[string]any{
		"intent": "CAPTURE",
		"purchase_units": []map[string]any{{"reference_id": orderID, "amount": map[string]string{"currency_code": currency, "value": fmt.Sprintf("%.2f", amount)}}},
	})
	req, _ := http.NewRequest(http.MethodPost, base+"/v2/checkout/orders", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return "", "", fmt.Errorf("PayPal order: %s", strings.TrimSpace(string(data)))
	}
	var order struct {
		ID    string `json:"id"`
		Links []struct {
			Rel  string `json:"rel"`
			Href string `json:"href"`
		} `json:"links"`
	}
	if json.Unmarshal(data, &order) != nil || order.ID == "" {
		return "", "", fmt.Errorf("invalid PayPal order response")
	}
	for _, link := range order.Links {
		if link.Rel == "approve" {
			return order.ID, link.Href, nil
		}
	}
	return "", "", fmt.Errorf("PayPal approval link missing")
}
func (p PayPalProvider) VerifyWebhook(payload []byte, credential string) (string, string, error) {
	if !verifyBasicOrToken(credential, p.ClientID, p.ClientSecret) {
		return "", "", fmt.Errorf("invalid PayPal authorization")
	}
	return webhookResult(payload)
}

type BankTransferProvider struct{}

func (BankTransferProvider) Name() string { return "bank_transfer" }
func (BankTransferProvider) CreateIntent(float64, string, string) (string, string, error) {
	return "bank_" + uuid.NewString()[:8], "", nil
}
func (BankTransferProvider) VerifyWebhook([]byte, string) (string, string, error) {
	return "bank_manual", "pending", nil
}

func firstSet(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
