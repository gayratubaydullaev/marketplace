package otelx

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestMiddlewareInjectsTraceparent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Middleware("test-svc"))
	r.GET("/x", func(c *gin.Context) { c.Status(204) })

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/x", nil)
	r.ServeHTTP(w, req)
	tp := w.Header().Get("traceparent")
	if tp == "" || len(tp) < 55 {
		t.Fatalf("missing traceparent: %q", tp)
	}
	if w.Header().Get("X-Service-Name") != "test-svc" {
		t.Fatal("missing service header")
	}
}
