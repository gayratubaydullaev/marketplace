package sms

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Sender dispatches OTP / transactional SMS.
type Sender interface {
	Send(to, body string) error
}

// LogSender writes to stdout (dev default).
type LogSender struct{}

func (LogSender) Send(to, body string) error {
	fmt.Printf("[sms] to=%s body=%s\n", to, body)
	return nil
}

// TwilioSender uses Twilio REST API.
type TwilioSender struct {
	AccountSID string
	AuthToken  string
	From       string
}

func (t TwilioSender) Send(to, body string) error {
	if t.AccountSID == "" || t.AuthToken == "" || t.From == "" {
		return fmt.Errorf("twilio not configured")
	}
	endpoint := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", t.AccountSID)
	form := url.Values{}
	form.Set("To", to)
	form.Set("From", t.From)
	form.Set("Body", body)
	req, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.SetBasicAuth(t.AccountSID, t.AuthToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("twilio status %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// EskizSender is a common Uzbekistan SMS gateway (Eskiz.uz).
type EskizSender struct {
	Email    string
	Password string
	From     string
	token    string
}

func (e *EskizSender) Send(to, body string) error {
	if e.Email == "" || e.Password == "" {
		return fmt.Errorf("eskiz not configured")
	}
	if e.token == "" {
		token, err := e.login()
		if err != nil {
			return err
		}
		e.token = token
	}
	form := url.Values{}
	form.Set("mobile_phone", strings.TrimPrefix(to, "+"))
	form.Set("message", body)
	if e.From != "" {
		form.Set("from", e.From)
	}
	req, err := http.NewRequest(http.MethodPost, "https://notify.eskiz.uz/api/message/sms/send", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+e.token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("eskiz status %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func (e *EskizSender) login() (string, error) {
	form := url.Values{}
	form.Set("email", e.Email)
	form.Set("password", e.Password)
	resp, err := http.PostForm("https://notify.eskiz.uz/api/auth/login", form)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.Data.Token == "" {
		return "", fmt.Errorf("eskiz login failed")
	}
	return out.Data.Token, nil
}

// FromEnv picks Twilio, Eskiz, or log sender.
func FromEnv() Sender {
	if sid := os.Getenv("TWILIO_ACCOUNT_SID"); sid != "" {
		return TwilioSender{
			AccountSID: sid,
			AuthToken:  os.Getenv("TWILIO_AUTH_TOKEN"),
			From:       os.Getenv("TWILIO_FROM"),
		}
	}
	if email := os.Getenv("ESKIZ_EMAIL"); email != "" {
		return &EskizSender{
			Email:    email,
			Password: os.Getenv("ESKIZ_PASSWORD"),
			From:     os.Getenv("ESKIZ_FROM"),
		}
	}
	return LogSender{}
}
