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

// MustConnect connects or panics — use at service boot for required Postgres.
func MustConnect(databaseURL string) *sqlx.DB {
	database, err := Connect(databaseURL)
	if err != nil {
		panic(err)
	}
	return database
}

// SetTenant sets app.current_tenant on one pooled connection only.
// Prefer WithTenant for handler work under FORCE RLS — SetTenant is not pool-safe.
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

// WithRLSBypass runs fn with row_security off for cross-tenant lookups (PSP webhooks).
// Prefer scoping by tenant when known; use only for provider id resolution.
func WithRLSBypass(database *sqlx.DB, fn func(tx *sqlx.Tx) error) error {
	if database == nil {
		return fmt.Errorf("database unavailable")
	}
	tx, err := database.Beginx()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`SET LOCAL row_security = off`); err != nil {
		return fmt.Errorf("rls bypass: %w", err)
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}
