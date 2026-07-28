package service

import (
	"crypto/md5"
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

func storefrontBase() string {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("NEXT_PUBLIC_STOREFRONT_URL")), "/")
	if base == "" {
		base = "http://localhost:3000"
	}
	return base
}

func paymentReturnURL(orderID string) string {
	return storefrontBase() + "/uz/orders/" + orderID + "/payment-return"
}

// PaymeCheckoutURL builds the official GET checkout link (base64 params).
func PaymeCheckoutURL(merchantID string, amountUZS float64, orderID, paymentID, returnURL string) string {
	tiyin := int64(amountUZS * 100)
	parts := []string{
		"m=" + merchantID,
		"ac.order_id=" + orderID,
		"ac.payment_id=" + paymentID,
		"a=" + strconv.FormatInt(tiyin, 10),
		"l=uz",
		"cr=UZS",
	}
	if returnURL != "" {
		parts = append(parts, "c="+returnURL)
		parts = append(parts, "ct=1000")
	}
	encoded := base64.StdEncoding.EncodeToString([]byte(strings.Join(parts, ";")))
	host := "https://checkout.paycom.uz"
	if Sandbox() && strings.EqualFold(os.Getenv("PAYME_TEST"), "true") {
		host = "https://test.paycom.uz"
	}
	return host + "/" + encoded
}

func (p PaymeProvider) CreateIntent(amount float64, _ string, orderID string) (string, string, error) {
	id := "payme_" + uuid.NewString()[:12]
	return id, PaymeCheckoutURL(p.MerchantID, amount, orderID, id, paymentReturnURL(orderID)), nil
}

func (p PaymeProvider) VerifyWebhook(payload []byte, credential string) (string, string, error) {
	if Sandbox() {
		if err := verifyHMAC(payload, credential, p.Secret); err != nil {
			return "", "", err
		}
		return webhookResult(payload)
	}
	// Live Payme uses Merchant API JSON-RPC; handled by PaymentHandler.PaymeMerchant.
	if !verifyPaymeAuth(credential, p.Secret) {
		return "", "", fmt.Errorf("invalid Payme authorization")
	}
	return webhookResult(payload)
}

// VerifyPaymeAuth checks Basic Paycom:<cashbox_key>.
func VerifyPaymeAuth(credential, secret string) bool {
	return verifyPaymeAuth(credential, secret)
}

func verifyPaymeAuth(credential, secret string) bool {
	credential = strings.TrimSpace(credential)
	if !strings.HasPrefix(strings.ToLower(credential), "basic ") {
		return false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(credential[6:]))
	if err != nil {
		return false
	}
	// Official: username "Paycom", password = cashbox key.
	return string(raw) == "Paycom:"+secret || string(raw) == ":"+secret
}

func (p ClickProvider) CreateIntent(amount float64, _ string, orderID string) (string, string, error) {
	id := "click_" + uuid.NewString()[:12]
	serviceID := firstSet(os.Getenv("CLICK_SERVICE_ID"), p.MerchantID)
	merchantID := firstSet(os.Getenv("CLICK_MERCHANT_ID"), p.MerchantID)
	q := url.Values{
		"service_id":         {serviceID},
		"merchant_id":        {merchantID},
		"amount":             {strconv.FormatInt(int64(amount), 10)},
		"transaction_param":  {orderID},
		"merchant_trans_id":  {id},
		"merchant_user_id":   {firstSet(os.Getenv("CLICK_MERCHANT_USER_ID"), "0")},
		"return_url":         {paymentReturnURL(orderID)},
	}
	return id, "https://my.click.uz/services/pay?" + q.Encode(), nil
}

func (p ClickProvider) VerifyWebhook(payload []byte, credential string) (string, string, error) {
	if Sandbox() {
		if err := verifyHMAC(payload, credential, p.Secret); err != nil {
			return "", "", err
		}
		return webhookResult(payload)
	}
	// Live Click posts form-encoded callbacks; handled by PaymentHandler.ClickCallback.
	if !verifyBasicOrToken(credential, p.MerchantID, p.Secret) {
		// Also accept MD5 sign embedded in form payload.
		if id, status, err := ParseClickForm(payload, p.Secret); err == nil {
			return id, status, nil
		}
		return "", "", fmt.Errorf("invalid Click authorization")
	}
	return webhookResult(payload)
}

// ParseClickForm verifies Click's MD5 sign_string and maps prepare/complete actions.
func ParseClickForm(payload []byte, secret string) (merchantTransID, status string, err error) {
	values, err := url.ParseQuery(string(payload))
	if err != nil {
		return "", "", fmt.Errorf("invalid click form")
	}
	clickTransID := values.Get("click_trans_id")
	serviceID := values.Get("service_id")
	merchantTransID = firstSet(values.Get("merchant_trans_id"), values.Get("payment_id"), values.Get("transaction_param"))
	amount := values.Get("amount")
	action := values.Get("action")
	signTime := values.Get("sign_time")
	sign := values.Get("sign_string")
	if merchantTransID == "" || sign == "" {
		return "", "", fmt.Errorf("click fields missing")
	}
	raw := clickTransID + serviceID + secret + merchantTransID + amount + action + signTime
	sum := md5.Sum([]byte(raw))
	expected := hex.EncodeToString(sum[:])
	if !strings.EqualFold(expected, sign) {
		return "", "", fmt.Errorf("invalid click signature")
	}
	status = "pending"
	// action=0 prepare, action=1 complete
	if action == "1" {
		status = "succeeded"
	}
	return merchantTransID, status, nil
}

func (p UzumProvider) CreateIntent(amount float64, _ string, orderID string) (string, string, error) {
	id := "uzum_" + uuid.NewString()[:12]
	if base := strings.TrimRight(os.Getenv("UZUM_API_BASE"), "/"); base != "" && !Sandbox() {
		// Merchant create-order API when configured; fall back to checkout URL on failure.
		if url, err := createUzumPayment(base, p.MerchantID, p.Secret, amount, orderID, id); err == nil && url != "" {
			return id, url, nil
		}
	}
	q := url.Values{
		"amount":     {strconv.FormatInt(int64(amount), 10)},
		"orderId":    {orderID},
		"paymentId":  {id},
		"returnUrl":  {paymentReturnURL(orderID)},
		"merchantId": {p.MerchantID},
	}
	return id, "https://www.uzumbank.uz/open-service?" + q.Encode(), nil
}

func (p UzumProvider) VerifyWebhook(payload []byte, credential string) (string, string, error) {
	if Sandbox() {
		if err := verifyHMAC(payload, credential, p.Secret); err != nil {
			return "", "", err
		}
		return webhookResult(payload)
	}
	if !verifyBasicOrToken(credential, p.MerchantID, p.Secret) {
		if err := verifyHMAC(payload, credential, p.Secret); err != nil {
			return "", "", fmt.Errorf("invalid Uzum authorization")
		}
	}
	return webhookResult(payload)
}

func createUzumPayment(apiBase, merchantID, secret string, amount float64, orderID, paymentID string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"amount":     int64(amount),
		"orderId":    orderID,
		"paymentId":  paymentID,
		"merchantId": merchantID,
		"returnUrl":  paymentReturnURL(orderID),
		"currency":   "UZS",
	})
	req, err := http.NewRequest(http.MethodPost, apiBase+"/v1/payments", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+secret)
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("uzum create: %s", strings.TrimSpace(string(data)))
	}
	var out struct {
		PaymentURL string `json:"paymentUrl"`
		URL        string `json:"url"`
		Redirect   string `json:"redirectUrl"`
	}
	if json.Unmarshal(data, &out) != nil {
		return "", fmt.Errorf("invalid uzum response")
	}
	return firstSet(out.PaymentURL, out.URL, out.Redirect), nil
}

// PaymeRPC is a Merchant API JSON-RPC request.
type PaymeRPC struct {
	ID     any            `json:"id"`
	Method string         `json:"method"`
	Params map[string]any `json:"params"`
}

func ParsePaymeRPC(payload []byte) (PaymeRPC, error) {
	var rpc PaymeRPC
	if err := json.Unmarshal(payload, &rpc); err != nil || rpc.Method == "" {
		return PaymeRPC{}, fmt.Errorf("invalid payme rpc")
	}
	return rpc, nil
}

func PaymeAccountOrderID(params map[string]any) string {
	if params == nil {
		return ""
	}
	if account, ok := params["account"].(map[string]any); ok {
		return firstSet(stringValue(account, "payment_id", "order_id", "orderId"), "")
	}
	return ""
}

func PaymeTransactionID(params map[string]any) string {
	return stringValue(params, "id")
}

func NowMS() int64 { return time.Now().UnixMilli() }
