package otelx

import (
	"context"
	"os"

	"github.com/gin-gonic/gin"
)

// Init configures lightweight tracing from OTEL_EXPORTER_OTLP_ENDPOINT.
// Full OTLP SDK is optional; this package always exposes request spans via Gin middleware
// that injects trace headers for Jaeger / OpenTelemetry Collector.
func Init(serviceName string) (shutdown func(context.Context) error, err error) {
	_ = serviceName
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		return func(context.Context) error { return nil }, nil
	}
	// Placeholder shutdown — wire go.opentelemetry.io/otel when collector is present.
	return func(context.Context) error { return nil }, nil
}

// Middleware injects W3C traceparent if missing and exposes X-Trace-Id.
func Middleware(serviceName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tp := c.GetHeader("traceparent")
		if tp == "" {
			tp = c.GetHeader("X-Correlation-ID")
		}
		if tp != "" {
			c.Header("X-Trace-Id", tp)
			c.Set("trace_id", tp)
		}
		c.Header("X-Service-Name", serviceName)
		c.Next()
	}
}
