package repository
import ("github.com/jmoiron/sqlx"; "github.com/gayrat/marketplace/services/notifications/internal/model")
type NotificationRepository struct{ db *sqlx.DB }
func New(db *sqlx.DB) *NotificationRepository { return &NotificationRepository{db} }
func (r *NotificationRepository) Create(n model.Notification, tenantID string) error { _, err := r.db.Exec(`INSERT INTO notifications (id, tenant_id, user_id, channel, type, title, body) VALUES ($1,$2,$3,$4,$5,$6,$7)`, n.ID, tenantID, n.UserID, n.Channel, n.Type, n.Title, n.Body); return err }
