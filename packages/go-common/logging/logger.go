// Package logging provides a consistent JSON logger for Go services.
package logging

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"log/slog"
	"os"
	"time"
)

type contextKey string

const correlationIDKey contextKey = "correlation_id"

// New creates a JSON logger suitable for container log collection.
func New(out io.Writer, level slog.Level) *slog.Logger {
	if out == nil {
		out = os.Stdout
	}
	return slog.New(slog.NewJSONHandler(out, &slog.HandlerOptions{Level: level}))
}

// WithCorrelation adds the request correlation ID to each log entry.
func WithCorrelation(logger *slog.Logger, correlationID string) *slog.Logger {
	return logger.With("correlation_id", correlationID)
}

// ContextWithCorrelation stores a correlation ID for downstream handlers.
func ContextWithCorrelation(ctx context.Context, correlationID string) context.Context {
	return context.WithValue(ctx, correlationIDKey, correlationID)
}

// CorrelationID returns the correlation ID propagated through ctx.
func CorrelationID(ctx context.Context) string {
	id, _ := ctx.Value(correlationIDKey).(string)
	return id
}

// Entry supports services which need to emit an explicit structured event.
type Entry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Service string `json:"service"`
	Msg     string `json:"msg"`
	CorrID  string `json:"correlation_id,omitempty"`
	Extra   any    `json:"extra,omitempty"`
}

func Log(service, level, msg, corrID string, extra any) {
	e := Entry{
		Time:    time.Now().UTC().Format(time.RFC3339Nano),
		Level:   level,
		Service: service,
		Msg:     msg,
		CorrID:  corrID,
		Extra:   extra,
	}
	b, err := json.Marshal(e)
	if err != nil {
		log.Println(msg)
		return
	}
	_, _ = os.Stdout.Write(append(b, '\n'))
}

func Info(service, msg, corrID string, extra any)  { Log(service, "info", msg, corrID, extra) }
func Error(service, msg, corrID string, extra any) { Log(service, "error", msg, corrID, extra) }
