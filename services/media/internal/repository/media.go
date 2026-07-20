package repository

import (
	"database/sql"

	"github.com/gayrat/marketplace/services/media/internal/model"
	"github.com/jmoiron/sqlx"
)

type MediaRepository struct{ db *sqlx.DB }
func New(database *sqlx.DB) *MediaRepository { return &MediaRepository{db: database} }
func (r *MediaRepository) Create(file model.File, tenantID, uploaderID, bucket, key, variants string) error {
	if r.db == nil { return nil }
	_, err := r.db.Exec(`INSERT INTO media_files (id, tenant_id, uploader_id, bucket, object_key, url, content_type, size_bytes, variants) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, file.ID, tenantID, uploaderID, bucket, key, file.URL, file.ContentType, file.Size, variants)
	return err
}
func (r *MediaRepository) Get(id string) (model.File, error) {
	var file model.File
	if r.db == nil { return file, sql.ErrNoRows }
	return file, r.db.Get(&file, `SELECT id, url FROM media_files WHERE id=$1`, id)
}
