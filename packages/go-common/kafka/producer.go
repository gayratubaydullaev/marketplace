package kafka

import (
	"context"
	"encoding/json"
	"time"

	"github.com/segmentio/kafka-go"
)

type Producer struct {
	writers map[string]*kafka.Writer
	brokers []string
}

func NewProducer(brokers []string) *Producer {
	return &Producer{
		writers: make(map[string]*kafka.Writer),
		brokers: brokers,
	}
}

func (p *Producer) writer(topic string) *kafka.Writer {
	if w, ok := p.writers[topic]; ok {
		return w
	}
	w := &kafka.Writer{
		Addr:         kafka.TCP(p.brokers...),
		Topic:        topic,
		Balancer:     &kafka.LeastBytes{},
		RequiredAcks: kafka.RequireOne,
		Async:        false,
	}
	p.writers[topic] = w
	return w
}

func (p *Producer) Publish(ctx context.Context, topic, key string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return p.writer(topic).WriteMessages(ctx, kafka.Message{
		Key:   []byte(key),
		Value: body,
		Time:  time.Now(),
	})
}

func (p *Producer) Close() error {
	var first error
	for _, w := range p.writers {
		if err := w.Close(); err != nil && first == nil {
			first = err
		}
	}
	return first
}

func NewReader(brokers []string, topic, group string) *kafka.Reader {
	return kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokers,
		Topic:    topic,
		GroupID:  group,
		MinBytes: 1,
		MaxBytes: 10e6,
	})
}
