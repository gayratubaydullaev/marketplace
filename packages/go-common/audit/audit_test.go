package audit

import (
	"context"
	"testing"
)

func TestNilLogger(t *testing.T) {
	var l *Logger
	if err := l.Log(context.Background(), Entry{TenantID: "t", Action: "x", ResourceType: "y"}); err != nil {
		t.Fatalf("nil logger: %v", err)
	}
}
