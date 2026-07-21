package audit

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// Entry is a single audit log record.
type Entry struct {
	TenantID      string
	ActorID       string
	ActorRole     string
	Action        string
	ResourceType  string
	ResourceID    string
	Before        any
	After         any
	IP            string
	UserAgent     string
	CorrelationID string
}

// Logger writes audit rows to Postgres.
type Logger struct {
	db *sqlx.DB
}

func New(db *sqlx.DB) *Logger {
	return &Logger{db: db}
}

func (l *Logger) Log(ctx context.Context, e Entry) error {
	if l == nil || l.db == nil {
		return nil
	}
	var before, after []byte
	var err error
	if e.Before != nil {
		before, err = json.Marshal(e.Before)
		if err != nil {
			return err
		}
	}
	if e.After != nil {
		after, err = json.Marshal(e.After)
		if err != nil {
			return err
		}
	}
	id := uuid.NewString()
	_, err = l.db.ExecContext(ctx, `
		INSERT INTO audit_logs (
			id, tenant_id, actor_id, actor_role, action, resource_type, resource_id,
			before_state, after_state, ip, user_agent, correlation_id, created_at
		) VALUES ($1,$2,NULLIF($3,'')::uuid,NULLIF($4,''),$5,$6,$7,$8,$9,$10,$11,$12,$13)
	`, id, e.TenantID, e.ActorID, e.ActorRole, e.Action, e.ResourceType, e.ResourceID,
		nullableJSON(before), nullableJSON(after), e.IP, e.UserAgent, e.CorrelationID, time.Now().UTC())
	return err
}

func nullableJSON(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}
