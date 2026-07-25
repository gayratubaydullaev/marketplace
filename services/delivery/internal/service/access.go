package service

import (
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"
)

// OrderAccess holds ownership fields for authz checks.
type OrderAccess struct {
	UserID  *string
	GuestID string
}

func (s *Service) GetOrderAccess(tenantID, orderID string) (*OrderAccess, error) {
	var row struct {
		UserID  *string `db:"user_id"`
		GuestID string  `db:"guest_id"`
	}
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&row, `
			SELECT user_id, COALESCE(metadata->>'guest_id','') AS guest_id
			FROM orders WHERE id=$1 AND tenant_id=$2`, orderID, tenantID)
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &OrderAccess{UserID: row.UserID, GuestID: row.GuestID}, nil
}

func (s *Service) VendorOwnsOrder(orderID, vendorID string) bool {
	if vendorID == "" {
		return false
	}
	var n int
	err := s.DB.Get(&n, `SELECT COUNT(1) FROM order_items WHERE order_id=$1 AND vendor_id::text=$2`, orderID, vendorID)
	return err == nil && n > 0
}

func (s *Service) CourierAssignedToOrder(tenantID, orderID, courierID string, activeOnly bool) bool {
	if courierID == "" {
		return false
	}
	q := `SELECT COUNT(1) FROM delivery_jobs WHERE order_id=$1 AND tenant_id=$2 AND courier_id::text=$3`
	if activeOnly {
		q += ` AND status IN ('assigned','accepted','at_pickup','picked_up','in_transit')`
	}
	var n int
	err := s.DB.Get(&n, q, orderID, tenantID, courierID)
	return err == nil && n > 0
}

func (s *Service) ResolveVendorID(tenantID, userID, claimVendorID string) string {
	if claimVendorID != "" {
		return claimVendorID
	}
	var id string
	_ = s.DB.Get(&id, `
		SELECT id::text FROM vendors
		WHERE user_id=$1 AND tenant_id=$2
		ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, created_at DESC
		LIMIT 1`, userID, tenantID)
	return id
}
