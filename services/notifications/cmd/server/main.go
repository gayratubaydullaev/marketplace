package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/config"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/notifications/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/segmentio/kafka-go"
)

func main() {
	cfg := config.Load("notifications-service")
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8009"
	}
	database, _ := db.Connect(cfg.DatabaseURL)
	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)

	smtp := service.NewSMTPFromEnv()
	transport := service.Transport(service.OutboxTransport{DB: database, Inner: smtp})
	if database != nil {
		go consumeEvents(cfg.KafkaBrokers, database, transport)
		go service.DrainOutbox(database, smtp)
		_, _ = database.Exec(`
			CREATE TABLE IF NOT EXISTS notification_outbox (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				tenant_id UUID NOT NULL,
				channel VARCHAR(20) NOT NULL,
				recipient VARCHAR(255) NOT NULL,
				subject TEXT,
				body TEXT,
				status VARCHAR(20) DEFAULT 'pending',
				created_at TIMESTAMPTZ DEFAULT NOW(),
				sent_at TIMESTAMPTZ
			)`)
	}

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.Tenant(), middleware.TenantDB(database), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	v1 := r.Group("/v1/notifications", middleware.JWT(tokenMgr, false))
	{
		v1.GET("", func(c *gin.Context) {
			claims := middleware.GetClaims(c)
			rows, err := database.Queryx(`SELECT id, channel, type, title, body, data, read_at, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, claims.UserID)
			if err != nil {
				httpx.Internal(c, err.Error())
				return
			}
			defer rows.Close()
			var items []map[string]any
			for rows.Next() {
				m := map[string]any{}
				_ = rows.MapScan(m)
				items = append(items, m)
			}
			httpx.OK(c, gin.H{"items": items})
		})
		v1.GET("/outbox", middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) {
			var items []map[string]any
			rows, err := database.Queryx(`SELECT id, channel, recipient, subject, status, created_at, sent_at FROM notification_outbox ORDER BY created_at DESC LIMIT 50`)
			if err != nil {
				httpx.Internal(c, err.Error())
				return
			}
			defer rows.Close()
			for rows.Next() {
				m := map[string]any{}
				_ = rows.MapScan(m)
				items = append(items, m)
			}
			httpx.OK(c, gin.H{"items": items})
		})
		v1.POST("/:id/read", func(c *gin.Context) {
			_, _ = database.Exec(`UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2`, c.Param("id"), middleware.GetClaims(c).UserID)
			httpx.OK(c, gin.H{"ok": true})
		})
		v1.GET("/preferences", func(c *gin.Context) {
			claims := middleware.GetClaims(c)
			m := map[string]any{}
			if err := database.QueryRowx(`SELECT email, sms, push, in_app, order_updates, promotions, digest FROM notification_preferences WHERE user_id=$1`, claims.UserID).MapScan(m); err != nil {
				httpx.OK(c, gin.H{"email": true, "sms": true, "push": true, "in_app": true, "order_updates": true, "promotions": false, "digest": "instant"})
				return
			}
			httpx.OK(c, m)
		})
		v1.PUT("/preferences", func(c *gin.Context) {
			claims := middleware.GetClaims(c)
			var body struct {
				Email        *bool  `json:"email"`
				SMS          *bool  `json:"sms"`
				Push         *bool  `json:"push"`
				InApp        *bool  `json:"in_app"`
				OrderUpdates *bool  `json:"order_updates"`
				Promotions   *bool  `json:"promotions"`
				Digest       string `json:"digest"`
			}
			if err := c.ShouldBindJSON(&body); err != nil {
				httpx.BadRequest(c, err.Error())
				return
			}
			_, err := database.Exec(`INSERT INTO notification_preferences (id, tenant_id, user_id, email, sms, push, in_app, order_updates, promotions, digest)
				VALUES ($1,$2,$3,COALESCE($4,true),COALESCE($5,true),COALESCE($6,true),COALESCE($7,true),COALESCE($8,true),COALESCE($9,false),COALESCE(NULLIF($10,''),'instant'))
				ON CONFLICT (user_id) DO UPDATE SET
					email=COALESCE($4, notification_preferences.email),
					sms=COALESCE($5, notification_preferences.sms),
					push=COALESCE($6, notification_preferences.push),
					in_app=COALESCE($7, notification_preferences.in_app),
					order_updates=COALESCE($8, notification_preferences.order_updates),
					promotions=COALESCE($9, notification_preferences.promotions),
					digest=COALESCE(NULLIF($10,''), notification_preferences.digest),
					updated_at=NOW()`,
				uuid.NewString(), middleware.GetTenantID(c), claims.UserID, body.Email, body.SMS, body.Push, body.InApp, body.OrderUpdates, body.Promotions, body.Digest)
			if err != nil {
				httpx.BadRequest(c, err.Error())
				return
			}
			httpx.OK(c, gin.H{"updated": true})
		})
		v1.POST("/send", middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) {
			var body struct {
				UserID  string          `json:"user_id" binding:"required"`
				Channel string          `json:"channel"`
				Type    string          `json:"type"`
				Title   json.RawMessage `json:"title"`
				Body    json.RawMessage `json:"body"`
			}
			if err := c.ShouldBindJSON(&body); err != nil {
				httpx.BadRequest(c, err.Error())
				return
			}
			if body.Channel == "" {
				body.Channel = "in_app"
			}
			id := uuid.NewString()
			_, err := database.Exec(`INSERT INTO notifications (id, tenant_id, user_id, channel, type, title, body) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
				id, middleware.GetTenantID(c), body.UserID, body.Channel, body.Type, body.Title, body.Body)
			if err != nil {
				httpx.BadRequest(c, err.Error())
				return
			}
			_ = transport.Send(body.Channel, body.UserID, string(body.Title), string(body.Body))
			httpx.Created(c, gin.H{"id": id})
		})
	}

	log.Printf("notifications-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}

func consumeEvents(brokers []string, database *sqlx.DB, transport service.Transport) {
	for _, topic := range []string{"order.created", "order.paid", "order.shipped", "order.status_updated", "review.submitted", "vendor.registered"} {
		go func(t string) {
			reader := kafkax.NewReader(brokers, t, "notifications")
			defer reader.Close()
			for {
				msg, err := reader.ReadMessage(context.Background())
				if err != nil {
					time.Sleep(time.Second)
					continue
				}
				storeFromEvent(database, transport, t, msg)
			}
		}(topic)
	}
}

func storeFromEvent(database *sqlx.DB, transport service.Transport, topic string, msg kafka.Message) {
	var payload map[string]any
	_ = json.Unmarshal(msg.Value, &payload)
	userID := fmtString(payload["user_id"])
	if userID == "" {
		log.Printf("[notify] %s no user_id: %s", topic, string(msg.Value))
		return
	}
	title, _ := json.Marshal(map[string]string{"uz": "Buyurtma yangilandi", "ru": "Заказ обновлён"})
	body, _ := json.Marshal(map[string]string{"uz": topic, "ru": topic})
	data, _ := json.Marshal(payload)
	tenantID := fmtString(payload["tenant_id"])
	if tenantID == "" {
		tenantID = "00000000-0000-0000-0000-000000000001"
	}
	_, _ = database.Exec(`INSERT INTO notifications (id, tenant_id, user_id, channel, type, title, body, data) VALUES ($1,$2,$3,'in_app',$4,$5,$6,$7)`,
		uuid.NewString(), tenantID, userID, topic, title, body, data)
	_ = transport.Send("in_app", userID, topic, string(msg.Value))
	_ = transport.Send("email", userID, topic, string(msg.Value))
}

func fmtString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case nil:
		return ""
	default:
		b, _ := json.Marshal(t)
		s := string(b)
		if len(s) >= 2 && s[0] == '"' {
			return s[1 : len(s)-1]
		}
		return s
	}
}
