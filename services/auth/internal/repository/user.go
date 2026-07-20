package repository

import (
	"database/sql"
	"errors"
	"time"

	"github.com/gayrat/marketplace/services/auth/internal/model"
	"github.com/jmoiron/sqlx"
)

type UserRepo struct {
	db *sqlx.DB
}

func NewUserRepo(db *sqlx.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) Create(u *model.User) error {
	_, err := r.db.NamedExec(`
		INSERT INTO users (id, tenant_id, email, password_hash, role, first_name, last_name, phone, locale, email_verified, status)
		VALUES (:id, :tenant_id, :email, :password_hash, :role, :first_name, :last_name, :phone, :locale, :email_verified, :status)
	`, u)
	return err
}

func (r *UserRepo) FindByEmail(tenantID, email string) (*model.User, error) {
	var u model.User
	err := r.db.Get(&u, `SELECT * FROM users WHERE tenant_id=$1 AND email=$2`, tenantID, email)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepo) FindByID(id string) (*model.User, error) {
	var u model.User
	err := r.db.Get(&u, `SELECT * FROM users WHERE id=$1`, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepo) Update(u *model.User) error {
	_, err := r.db.NamedExec(`
		UPDATE users SET first_name=:first_name, last_name=:last_name, phone=:phone,
		locale=:locale, avatar_url=:avatar_url, email_verified=:email_verified,
		phone_verified=:phone_verified, password_hash=:password_hash, updated_at=NOW()
		WHERE id=:id
	`, u)
	return err
}

func (r *UserRepo) SaveRefreshToken(userID, tokenHash string, expiresAt time.Time) error {
	_, err := r.db.Exec(`
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)
	`, userID, tokenHash, expiresAt)
	return err
}

func (r *UserRepo) RevokeRefreshToken(tokenHash string) error {
	_, err := r.db.Exec(`UPDATE refresh_tokens SET revoked=true WHERE token_hash=$1`, tokenHash)
	return err
}

func (r *UserRepo) IsRefreshValid(tokenHash string) (bool, error) {
	var count int
	err := r.db.Get(&count, `
		SELECT COUNT(1) FROM refresh_tokens
		WHERE token_hash=$1 AND revoked=false AND expires_at > NOW()
	`, tokenHash)
	return count > 0, err
}

func (r *UserRepo) EnsureAdminPassword(hash string) error {
	_, err := r.db.Exec(`
		UPDATE users SET password_hash=$1
		WHERE email='admin@gayrat.uz' AND tenant_id='00000000-0000-0000-0000-000000000001'
	`, hash)
	return err
}

func (r *UserRepo) ListByTenant(tenantID string, limit int) ([]model.User, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	var users []model.User
	err := r.db.Select(&users, `
		SELECT id, tenant_id, email, role, first_name, last_name, phone, locale, email_verified, phone_verified, status, created_at, updated_at
		FROM users WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`, tenantID, limit)
	return users, err
}

func (r *UserRepo) SaveEmailVerification(userID, tokenHash string, expiresAt time.Time) error {
	_, err := r.db.Exec(`
		INSERT INTO email_verifications (user_id, token_hash, expires_at)
		VALUES ($1,$2,$3)
	`, userID, tokenHash, expiresAt)
	return err
}

func (r *UserRepo) ConsumeEmailVerification(tokenHash string) (string, error) {
	var userID string
	err := r.db.Get(&userID, `
		SELECT user_id FROM email_verifications
		WHERE token_hash=$1 AND used=false AND expires_at > NOW()
	`, tokenHash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errors.New("invalid or expired verification token")
	}
	if err != nil {
		return "", err
	}
	_, _ = r.db.Exec(`UPDATE email_verifications SET used=true WHERE token_hash=$1`, tokenHash)
	_, _ = r.db.Exec(`UPDATE users SET email_verified=true, updated_at=NOW() WHERE id=$1`, userID)
	return userID, nil
}
