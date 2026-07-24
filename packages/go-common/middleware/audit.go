package middleware

import (
	"os"

	"github.com/gayrat/marketplace/packages/go-common/audit"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

// AuditLogger attaches an audit.Logger to the gin context when DB is available.
func AuditLogger(db *sqlx.DB) gin.HandlerFunc {
	var logger *audit.Logger
	if db != nil {
		logger = audit.New(db)
	}
	return func(c *gin.Context) {
		if logger != nil {
			c.Set("audit_logger", logger)
		}
		c.Next()
	}
}

// WriteAudit records a mutation. No-op if logger missing.
func WriteAudit(c *gin.Context, action, resourceType, resourceID string, before, after any) {
	v, ok := c.Get("audit_logger")
	if !ok || v == nil {
		return
	}
	logger, ok := v.(*audit.Logger)
	if !ok || logger == nil {
		return
	}
	entry := audit.Entry{
		TenantID:      GetTenantID(c),
		Action:        action,
		ResourceType:  resourceType,
		ResourceID:    resourceID,
		Before:        before,
		After:         after,
		IP:            c.ClientIP(),
		UserAgent:     c.Request.UserAgent(),
		CorrelationID: c.GetString("correlation_id"),
	}
	if claims := GetClaims(c); claims != nil {
		entry.ActorID = claims.UserID
		entry.ActorRole = string(claims.Role)
	}
	_ = logger.Log(c.Request.Context(), entry)
}

// PaymentsSandbox mirrors PAYMENTS_SANDBOX env (default true).
func PaymentsSandbox() bool {
	return os.Getenv("PAYMENTS_SANDBOX") != "false"
}
