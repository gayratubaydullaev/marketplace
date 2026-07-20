package repository
import "github.com/jmoiron/sqlx"
type Repository struct { db *sqlx.DB }
func New(db *sqlx.DB) *Repository { return &Repository{db} }
func (r *Repository) MarkHelpful(id string) error { _, err := r.db.Exec(`UPDATE reviews SET helpful_count=helpful_count+1 WHERE id=$1`, id); return err }
