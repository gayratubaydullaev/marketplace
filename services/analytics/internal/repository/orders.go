package repository
import "github.com/jmoiron/sqlx"
type OrdersRepository struct{ db *sqlx.DB }
func New(db *sqlx.DB) *OrdersRepository { return &OrdersRepository{db} }
func (r *OrdersRepository) CountToday(tenantID string) int { var n int; if r.db != nil { _ = r.db.Get(&n, `SELECT COUNT(*) FROM orders WHERE tenant_id=$1 AND created_at::date=CURRENT_DATE`, tenantID) }; return n }
