package service

import (
	"context"
	"encoding/json"
	"time"

	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/services/realtime/internal/repository"
)

type Bridge struct {
	brokers []string
	centrifugo *repository.CentrifugoClient
}

func NewBridge(brokers []string, centrifugo *repository.CentrifugoClient) *Bridge {
	return &Bridge{brokers: brokers, centrifugo: centrifugo}
}

func (b *Bridge) Start() {
	for _, topic := range []string{"order.paid", "order.shipped", "order.status_updated"} {
		go b.consume(topic)
	}
}

func (b *Bridge) consume(topic string) {
	reader := kafkax.NewReader(b.brokers, topic, "realtime-bridge")
	defer reader.Close()
	for {
		msg, err := reader.ReadMessage(context.Background())
		if err != nil { time.Sleep(time.Second); continue }
		var payload map[string]any
		_ = json.Unmarshal(msg.Value, &payload)
		userID, _ := payload["user_id"].(string)
		if userID == "" { continue }
		event := map[string]any{"type": topic, "data": payload}
		_ = b.centrifugo.Publish("orders:#"+userID, event)
		_ = b.centrifugo.Publish("notifications:#"+userID, event)
	}
}
