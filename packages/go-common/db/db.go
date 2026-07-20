package db

import (
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func Connect(databaseURL string) (*sqlx.DB, error) {
	db, err := sqlx.Connect("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect db: %w", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(30 * time.Minute)
	return db, nil
}

// SetTenant sets app.current_tenant for RLS policies (session-scoped on the connection).
func SetTenant(database *sqlx.DB, tenantID string) error {
	if database == nil || tenantID == "" {
		return nil
	}
	_, err := database.Exec(`SELECT set_config('app.current_tenant', $1, false)`, tenantID)
	return err
}

// WithTenant runs fn inside a transaction with transaction-local tenant GUC (pool-safe).
func WithTenant(database *sqlx.DB, tenantID string, fn func(tx *sqlx.Tx) error) error {
	if database == nil {
		return fmt.Errorf("database unavailable")
	}
	tx, err := database.Beginx()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if tenantID != "" {
		if _, err := tx.Exec(`SELECT set_config('app.current_tenant', $1, true)`, tenantID); err != nil {
			return err
		}
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}
