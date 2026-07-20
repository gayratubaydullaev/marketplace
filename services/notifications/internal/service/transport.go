package service

import (
	"fmt"
	"log"
	"net"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type Transport interface {
	Send(channel, to, subject, body string) error
}

type SMSTransport interface {
	SendSMS(to, body string) error
}

type LogSMSTransport struct{}

func (LogSMSTransport) SendSMS(to, body string) error {
	log.Printf("[notify/sms] to=%s body=%s", to, body)
	return nil
}

type PushTransport interface {
	SendPush(to, title, body string) error
}

type LogPushTransport struct{}

func (LogPushTransport) SendPush(to, title, body string) error {
	log.Printf("[notify/push] to=%s title=%s body=%s", to, title, body)
	return nil
}

type LogTransport struct{}

func (LogTransport) Send(channel, to, subject, body string) error {
	log.Printf("[notify/%s] to=%s subject=%s body=%s", channel, to, subject, body)
	return nil
}

type OutboxTransport struct {
	DB       *sqlx.DB
	TenantID string
	Inner    Transport
}

func (o OutboxTransport) Send(channel, to, subject, body string) error {
	if o.Inner != nil {
		_ = o.Inner.Send(channel, to, subject, body)
	}
	if o.DB == nil {
		return nil
	}
	tenant := o.TenantID
	if tenant == "" {
		tenant = "00000000-0000-0000-0000-000000000001"
	}
	_, err := o.DB.Exec(`
		INSERT INTO notification_outbox (id, tenant_id, channel, recipient, subject, body, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW())`,
		uuid.NewString(), tenant, channel, to, subject, body)
	return err
}

type SMTPTransport struct {
	Addr string
	From string
	Auth smtp.Auth
}

func NewSMTPFromEnv() Transport {
	smtpURL := os.Getenv("SMTP_URL") // e.g. smtp://user:pass@localhost:1025
	if smtpURL == "" {
		if strings.EqualFold(os.Getenv("APP_ENV"), "production") {
			log.Printf("[notify/smtp] WARNING: SMTP_URL is required in production; email will be logged only")
		}
		return LogTransport{}
	}
	host := "localhost:1025"
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = "noreply@gayrat.uz"
	}
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	if strings.Contains(smtpURL, "://") {
		// smtp://user:pass@host:port
		rest := strings.TrimPrefix(strings.TrimPrefix(smtpURL, "smtp://"), "smtps://")
		if at := strings.LastIndex(rest, "@"); at >= 0 {
			cred, addr := rest[:at], rest[at+1:]
			host = addr
			if parts := strings.SplitN(cred, ":", 2); len(parts) == 2 {
				user, pass = parts[0], parts[1]
			}
		} else {
			host = rest
		}
	}
	var auth smtp.Auth
	if user != "" {
		h, _, _ := net.SplitHostPort(host)
		if h == "" {
			h = host
		}
		auth = smtp.PlainAuth("", user, pass, h)
	}
	return SMTPTransport{Addr: host, From: from, Auth: auth}
}

func (s SMTPTransport) Send(channel, to, subject, body string) error {
	if channel != "email" && channel != "smtp" {
		log.Printf("[notify/%s] skip smtp for channel", channel)
		return nil
	}
	msg := []byte(fmt.Sprintf("To: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", to, subject, body))
	var err error
	if s.Auth != nil {
		err = smtp.SendMail(s.Addr, s.Auth, s.From, []string{to}, msg)
	} else {
		err = smtp.SendMail(s.Addr, nil, s.From, []string{to}, msg)
	}
	if err != nil {
		log.Printf("[notify/smtp] send failed: %v — logged only", err)
		log.Printf("[notify/email] to=%s subject=%s", to, subject)
		return nil // soft-fail for scaffold
	}
	return nil
}

// DrainOutbox marks pending rows as sent and delivers via inner transport.
func DrainOutbox(database *sqlx.DB, inner Transport) {
	if database == nil {
		return
	}
	for {
		var rows []struct {
			ID        string `db:"id"`
			Channel   string `db:"channel"`
			Recipient string `db:"recipient"`
			Subject   string `db:"subject"`
			Body      string `db:"body"`
		}
		err := database.Select(&rows, `
			SELECT id, channel, recipient, subject, body FROM notification_outbox
			WHERE status='pending' ORDER BY created_at ASC LIMIT 20`)
		if err != nil || len(rows) == 0 {
			time.Sleep(3 * time.Second)
			continue
		}
		for _, row := range rows {
			_ = inner.Send(row.Channel, row.Recipient, row.Subject, row.Body)
			_, _ = database.Exec(`UPDATE notification_outbox SET status='sent', sent_at=NOW() WHERE id=$1`, row.ID)
		}
	}
}
