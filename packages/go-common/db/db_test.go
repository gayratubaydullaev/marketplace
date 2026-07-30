package db_test

import (
	"testing"

	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/jmoiron/sqlx"
)

func TestWithTenantNilDB(t *testing.T) {
	err := db.WithTenant(nil, "t1", func(_ *sqlx.Tx) error { return nil })
	if err == nil {
		t.Fatal("expected error for nil database")
	}
}

func TestWithRLSBypassNilDB(t *testing.T) {
	err := db.WithRLSBypass(nil, func(_ *sqlx.Tx) error { return nil })
	if err == nil {
		t.Fatal("expected error for nil database")
	}
}
