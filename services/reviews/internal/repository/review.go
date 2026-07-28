package repository

import (
	"github.com/jmoiron/sqlx"
)

type Repository struct {
	db *sqlx.DB
}

func New(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) MarkHelpful(reviewID, userID string) (int64, error) {
	res, err := r.db.Exec(`INSERT INTO review_helpful_votes (review_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, reviewID, userID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *Repository) IncrementHelpful(reviewID string) error {
	_, err := r.db.Exec(`UPDATE reviews SET helpful_count = helpful_count + 1, updated_at = NOW() WHERE id=$1`, reviewID)
	return err
}
