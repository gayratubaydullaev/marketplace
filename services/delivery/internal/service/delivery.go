package service

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/services/delivery/internal/model"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound       = errors.New("not found")
	ErrConflict       = errors.New("conflict")
	ErrBadRequest     = errors.New("bad request")
	ErrForbidden      = errors.New("forbidden")
	ErrPaymentPending = errors.New("payment must be collected before delivery")
)

type Service struct {
	DB                 *sqlx.DB
	PaymentsURL        string
	YandexGeocoderKey  string
	HTTP               *http.Client
}

func New(database *sqlx.DB, paymentsURL, yandexGeocoderKey string) *Service {
	return &Service{
		DB:                database,
		PaymentsURL:       strings.TrimRight(paymentsURL, "/"),
		YandexGeocoderKey: strings.TrimSpace(yandexGeocoderKey),
		HTTP:              &http.Client{Timeout: 15 * time.Second},
	}
}

func (s *Service) withTenant(tenantID string, fn func(tx *sqlx.Tx) error) error {
	return db.WithTenant(s.DB, tenantID, fn)
}

// --- Couriers (admin) ---

func (s *Service) ListCouriers(tenantID string) ([]model.Courier, error) {
	var out []model.Courier
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&out, `
			SELECT c.id, c.tenant_id, c.user_id, c.full_name, c.phone, c.status, c.vehicle_type,
			       c.last_lat, c.last_lng, c.last_seen_at, c.rating_avg::float8 AS rating_avg, c.rating_count,
			       c.created_at, c.updated_at, COALESCE(u.email,'') AS email,
			       EXISTS(SELECT 1 FROM courier_shifts s WHERE s.courier_id=c.id AND s.status='open') AS on_shift,
			       (SELECT COUNT(*) FROM delivery_jobs j WHERE j.courier_id=c.id AND j.status IN ('assigned','accepted','at_pickup','picked_up','in_transit'))::int AS active_jobs
			FROM couriers c
			LEFT JOIN users u ON u.id=c.user_id
			ORDER BY c.created_at DESC`)
	})
	return out, err
}

func (s *Service) GetCourier(tenantID, id string) (*model.Courier, error) {
	var c model.Courier
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&c, `
			SELECT c.id, c.tenant_id, c.user_id, c.full_name, c.phone, c.status, c.vehicle_type,
			       c.last_lat, c.last_lng, c.last_seen_at, c.rating_avg::float8 AS rating_avg, c.rating_count,
			       c.created_at, c.updated_at, COALESCE(u.email,'') AS email,
			       EXISTS(SELECT 1 FROM courier_shifts s WHERE s.courier_id=c.id AND s.status='open') AS on_shift,
			       (SELECT COUNT(*) FROM delivery_jobs j WHERE j.courier_id=c.id AND j.status IN ('assigned','accepted','at_pickup','picked_up','in_transit'))::int AS active_jobs
			FROM couriers c LEFT JOIN users u ON u.id=c.user_id WHERE c.id=$1`, id)
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &c, err
}

func (s *Service) UpdateCourierSelf(tenantID, courierID, phone, vehicleType, fullName string) (*model.Courier, error) {
	phone = strings.TrimSpace(phone)
	vehicleType = strings.TrimSpace(vehicleType)
	fullName = strings.TrimSpace(fullName)
	if vehicleType == "" {
		vehicleType = "bike"
	}
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		res, err := tx.Exec(`
			UPDATE couriers SET
			  phone=COALESCE(NULLIF($1,''), phone),
			  vehicle_type=$2,
			  full_name=COALESCE(NULLIF($3,''), full_name),
			  updated_at=NOW()
			WHERE id=$4`, phone, vehicleType, fullName, courierID)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return ErrNotFound
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetCourier(tenantID, courierID)
}

type CreateCourierInput struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	FullName    string `json:"full_name"`
	Phone       string `json:"phone"`
	VehicleType string `json:"vehicle_type"`
	Approve     bool   `json:"approve"`
}

func (s *Service) CreateCourier(tenantID string, in CreateCourierInput) (*model.Courier, error) {
	if in.Email == "" || in.Password == "" || in.FullName == "" {
		return nil, fmt.Errorf("%w: email, password, full_name required", ErrBadRequest)
	}
	if in.VehicleType == "" {
		in.VehicleType = "bike"
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	status := "pending"
	if in.Approve {
		status = "active"
	}
	userID := uuid.NewString()
	courierID := uuid.NewString()
	var out model.Courier
	err = s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		parts := strings.Fields(in.FullName)
		first, last := in.FullName, ""
		if len(parts) > 1 {
			first, last = parts[0], strings.Join(parts[1:], " ")
		}
		var existing struct {
			ID   string `db:"id"`
			Role string `db:"role"`
		}
		err := tx.Get(&existing, `SELECT id::text AS id, role FROM users WHERE tenant_id=$1 AND lower(email)=lower($2)`, tenantID, in.Email)
		if err == nil {
			if existing.Role != "courier" {
				return fmt.Errorf("%w: email already registered", ErrConflict)
			}
			userID = existing.ID
			_, err = tx.Exec(`
				UPDATE users SET password_hash=$1, first_name=$2, last_name=$3,
				  phone=COALESCE(NULLIF($4,''), phone), status='active', updated_at=NOW()
				WHERE id=$5`, string(hash), first, last, in.Phone, userID)
			if err != nil {
				return err
			}
		} else if errors.Is(err, sql.ErrNoRows) {
			_, err = tx.Exec(`
				INSERT INTO users (id, tenant_id, email, password_hash, role, first_name, last_name, phone, locale, email_verified, status)
				VALUES ($1,$2,$3,$4,'courier',$5,$6,$7,'uz',TRUE,'active')`,
				userID, tenantID, strings.ToLower(in.Email), string(hash), first, last, in.Phone)
			if err != nil {
				return err
			}
		} else {
			return err
		}
		_, err = tx.Exec(`
			INSERT INTO couriers (id, tenant_id, user_id, full_name, phone, status, vehicle_type)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			ON CONFLICT (tenant_id, user_id) DO UPDATE SET
			  full_name=EXCLUDED.full_name, phone=EXCLUDED.phone, vehicle_type=EXCLUDED.vehicle_type,
			  status=CASE WHEN couriers.status='blocked' THEN couriers.status ELSE EXCLUDED.status END,
			  updated_at=NOW()`, courierID, tenantID, userID, in.FullName, in.Phone, status, in.VehicleType)
		if err != nil {
			return err
		}
		return tx.Get(&out, `
			SELECT id, tenant_id, user_id, full_name, phone, status, vehicle_type, last_lat, last_lng, last_seen_at,
			       rating_avg::float8 AS rating_avg, rating_count, created_at, updated_at
			FROM couriers WHERE user_id=$1 AND tenant_id=$2`, userID, tenantID)
	})
	return &out, err
}

func (s *Service) SetCourierStatus(tenantID, id, status string) (*model.Courier, error) {
	if status != "pending" && status != "active" && status != "blocked" {
		return nil, fmt.Errorf("%w: invalid status", ErrBadRequest)
	}
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		res, err := tx.Exec(`UPDATE couriers SET status=$1, updated_at=NOW() WHERE id=$2`, status, id)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return ErrNotFound
		}
		userStatus := "active"
		if status == "blocked" {
			userStatus = "suspended"
			_, _ = tx.Exec(`UPDATE courier_shifts SET status='closed', ended_at=NOW() WHERE courier_id=$1 AND status='open'`, id)
		}
		_, err = tx.Exec(`
			UPDATE users SET status=$1, updated_at=NOW()
			WHERE id=(SELECT user_id FROM couriers WHERE id=$2)`, userStatus, id)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetCourier(tenantID, id)
}

func (s *Service) CourierByUser(tenantID, userID string) (*model.Courier, error) {
	var c model.Courier
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&c, `
			SELECT id, tenant_id, user_id, full_name, phone, status, vehicle_type, last_lat, last_lng, last_seen_at,
			       rating_avg::float8 AS rating_avg, rating_count, created_at, updated_at
			FROM couriers WHERE user_id=$1`, userID)
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &c, err
}

// --- Shifts / location ---

func (s *Service) OpenShift(tenantID, courierID string) (*model.Shift, error) {
	var sh model.Shift
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var st string
		if err := tx.Get(&st, `SELECT status FROM couriers WHERE id=$1`, courierID); err != nil {
			return ErrNotFound
		}
		if st != "active" {
			return fmt.Errorf("%w: courier not active", ErrForbidden)
		}
		var existing string
		err := tx.Get(&existing, `SELECT id::text FROM courier_shifts WHERE courier_id=$1 AND status='open' LIMIT 1`, courierID)
		if err == nil {
			assignPendingJobsTx(tx, tenantID, 20)
			return tx.Get(&sh, `SELECT id, tenant_id, courier_id, started_at, ended_at, status FROM courier_shifts WHERE id=$1`, existing)
		}
		id := uuid.NewString()
		_, err = tx.Exec(`INSERT INTO courier_shifts (id, tenant_id, courier_id, status) VALUES ($1,$2,$3,'open')`, id, tenantID, courierID)
		if err != nil {
			return err
		}
		assignPendingJobsTx(tx, tenantID, 20)
		return tx.Get(&sh, `SELECT id, tenant_id, courier_id, started_at, ended_at, status FROM courier_shifts WHERE id=$1`, id)
	})
	return &sh, err
}

func (s *Service) CloseShift(tenantID, courierID string) error {
	return s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(`UPDATE courier_shifts SET status='closed', ended_at=NOW() WHERE courier_id=$1 AND status='open'`, courierID)
		return err
	})
}

func (s *Service) CurrentShift(tenantID, courierID string) (*model.Shift, error) {
	var sh model.Shift
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&sh, `SELECT id, tenant_id, courier_id, started_at, ended_at, status FROM courier_shifts WHERE courier_id=$1 AND status='open' LIMIT 1`, courierID)
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &sh, err
}

func (s *Service) UpdateLocation(tenantID, courierID string, lat, lng float64) error {
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return fmt.Errorf("%w: invalid coordinates", ErrBadRequest)
	}
	return s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var st string
		if err := tx.Get(&st, `SELECT status FROM couriers WHERE id=$1`, courierID); err != nil {
			return ErrNotFound
		}
		if st != "active" {
			return fmt.Errorf("%w: courier not active", ErrForbidden)
		}
		var open int
		if err := tx.Get(&open, `SELECT COUNT(1) FROM courier_shifts WHERE courier_id=$1 AND status='open'`, courierID); err != nil {
			return err
		}
		if open == 0 {
			return fmt.Errorf("%w: open shift required", ErrForbidden)
		}
		_, err := tx.Exec(`UPDATE couriers SET last_lat=$1, last_lng=$2, last_seen_at=NOW(), updated_at=NOW() WHERE id=$3`, lat, lng, courierID)
		return err
	})
}

// --- Jobs ---

type orderRow struct {
	ID              string          `db:"id"`
	Status          string          `db:"status"`
	PaymentStatus   string          `db:"payment_status"`
	PaymentMethod   string          `db:"payment_method"`
	Total           float64         `db:"total"`
	ShippingCost    float64         `db:"shipping_cost"`
	ShippingAddress json.RawMessage `db:"shipping_address"`
	OrderNumber     string          `db:"order_number"`
	UserID          *string         `db:"user_id"`
}

func formatAddress(addr map[string]any) string {
	parts := []string{}
	for _, k := range []string{"region", "district", "address_line1", "street", "building", "apartment", "city"} {
		if v, ok := addr[k].(string); ok && v != "" {
			parts = append(parts, v)
		}
	}
	return strings.Join(parts, ", ")
}

func (s *Service) ReadyForDelivery(tenantID, orderID, vendorID, actorRole, actorID string) (*model.Job, error) {
	var job model.Job
	var pickup, dropoff, custName, custPhone string
	var pickupLat, pickupLng, dropoffLat, dropoffLng *float64
	var vid *string
	var cod, shippingCost float64
	var needInsert bool

	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var o orderRow
		if err := tx.Get(&o, `
			SELECT id::text, status, COALESCE(payment_status,'unpaid') AS payment_status, COALESCE(payment_method,'') AS payment_method,
			       total::float8 AS total, shipping_cost::float8 AS shipping_cost, shipping_address, order_number, user_id::text
			FROM orders WHERE id=$1`, orderID); err != nil {
			return ErrNotFound
		}
		if o.Status != "processing" {
			return fmt.Errorf("%w: order must be processing", ErrBadRequest)
		}
		var addr map[string]any
		_ = json.Unmarshal(o.ShippingAddress, &addr)
		method, _ := addr["delivery_method"].(string)
		if method != "" && method != "courier" {
			return fmt.Errorf("%w: only courier delivery orders", ErrBadRequest)
		}
		if vendorID != "" {
			var n int
			if err := tx.Get(&n, `SELECT COUNT(*) FROM order_items WHERE order_id=$1 AND vendor_id::text=$2`, orderID, vendorID); err != nil || n == 0 {
				return fmt.Errorf("%w: order not owned by vendor", ErrForbidden)
			}
		}
		var existing string
		err := tx.Get(&existing, `
			SELECT id::text FROM delivery_jobs
			WHERE order_id=$1 AND status NOT IN ('delivered','cancelled') LIMIT 1`, orderID)
		if err == nil {
			return tx.Get(&job, jobSelect()+" WHERE j.id=$1", existing)
		}

		pickup = "Vendor warehouse"
		var wh struct {
			Name    string   `db:"name"`
			Address string   `db:"warehouse_address"`
			Lat     *float64 `db:"warehouse_lat"`
			Lng     *float64 `db:"warehouse_lng"`
			ID      string   `db:"id"`
		}
		_ = tx.Get(&wh, `
			SELECT v.id::text, COALESCE(v.name,'Vendor') AS name,
			       COALESCE(v.warehouse_address,'') AS warehouse_address,
			       v.warehouse_lat, v.warehouse_lng
			FROM order_items oi
			JOIN vendors v ON v.id=oi.vendor_id
			WHERE oi.order_id=$1 LIMIT 1`, orderID)
		if wh.Name != "" {
			pickup = wh.Name
		}
		if wh.Address != "" {
			pickup = wh.Name + " — " + wh.Address
		}
		pickupLat, pickupLng = wh.Lat, wh.Lng
		if wh.ID != "" {
			vid = &wh.ID
		}

		dropoff = formatAddress(addr)
		custName, _ = addr["full_name"].(string)
		if custName == "" {
			custName, _ = addr["name"].(string)
		}
		custPhone, _ = addr["phone"].(string)
		if la, ok := asFloat(addr["lat"]); ok {
			if lo, ok2 := asFloat(addr["lng"]); ok2 {
				dropoffLat, dropoffLng = &la, &lo
			}
		}
		shippingCost = o.ShippingCost
		cod = 0.0
		if o.PaymentStatus != "paid" && (o.PaymentMethod == "cash_on_delivery" || o.PaymentMethod == "card_on_delivery" || o.PaymentMethod == "bank_transfer") {
			cod = o.Total
		}
		needInsert = true
		return nil
	})
	if err != nil {
		return nil, err
	}
	if !needInsert {
		return &job, nil
	}

	ctx := context.Background()
	if pickupLat == nil || pickupLng == nil {
		if la, lo, gerr := s.GeocodeAddress(ctx, pickup); gerr == nil {
			pickupLat, pickupLng = la, lo
		}
	}
	if dropoffLat == nil || dropoffLng == nil {
		if la, lo, gerr := s.GeocodeAddress(ctx, dropoff); gerr == nil {
			dropoffLat, dropoffLng = la, lo
		}
	}

	err = s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var existing string
		err := tx.Get(&existing, `
			SELECT id::text FROM delivery_jobs
			WHERE order_id=$1 AND status NOT IN ('delivered','cancelled') LIMIT 1`, orderID)
		if err == nil {
			return tx.Get(&job, jobSelect()+" WHERE j.id=$1", existing)
		}
		id := uuid.NewString()
		_, err = tx.Exec(`
			INSERT INTO delivery_jobs (
				id, tenant_id, order_id, status, pickup_address, dropoff_address,
				pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
				customer_name, customer_phone, vendor_id, cod_amount, delivery_fee, currency
			) VALUES ($1,$2,$3,'pending_assign',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'UZS')`,
			id, tenantID, orderID, pickup, dropoff,
			pickupLat, pickupLng, dropoffLat, dropoffLng,
			custName, custPhone, vid, cod, shippingCost)
		if err != nil {
			return err
		}
		_ = addEvent(tx, tenantID, id, "", "pending_assign", actorRole, actorID, "ready for delivery")
		if err := autoAssignTx(tx, tenantID, id); err != nil {
			return err
		}
		return tx.Get(&job, jobSelect()+" WHERE j.id=$1", id)
	})
	return &job, err
}

func jobSelect() string {
	return `
		SELECT j.id, j.tenant_id, j.order_id, j.courier_id, j.status, j.pickup_address, j.dropoff_address,
		       j.pickup_lat, j.pickup_lng, j.dropoff_lat, j.dropoff_lng, j.customer_name, j.customer_phone,
		       j.vendor_id, j.assigned_at, j.accepted_at, j.picked_up_at, j.delivered_at, j.sequence,
		       j.cod_amount::float8 AS cod_amount, j.cod_collected_amount::float8 AS cod_collected_amount,
		       j.cod_dispute, j.cod_dispute_note, j.metadata,
		       j.delivery_fee::float8 AS delivery_fee, j.currency,
		       j.created_at, j.updated_at, COALESCE(o.order_number,'') AS order_number,
		       COALESCE(o.payment_status,'unpaid') AS payment_status,
		       COALESCE(c.full_name,'') AS courier_name, COALESCE(c.phone,'') AS courier_phone
		FROM delivery_jobs j
		LEFT JOIN orders o ON o.id=j.order_id
		LEFT JOIN couriers c ON c.id=j.courier_id`
}

func addEvent(tx *sqlx.Tx, tenantID, jobID, from, to, role, actor, note string) error {
	_, err := tx.Exec(`
		INSERT INTO delivery_job_events (id, tenant_id, job_id, from_status, to_status, actor_role, actor_id, note)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, uuid.NewString(), tenantID, jobID, nullStr(from), to, role, actor, note)
	return err
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	const r = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * r * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

const maxActiveJobsPerCourier = 8

type candidate struct {
	ID         string     `db:"id"`
	LastLat    *float64   `db:"last_lat"`
	LastLng    *float64   `db:"last_lng"`
	LastSeenAt *time.Time `db:"last_seen_at"`
	ActiveJobs int        `db:"active_jobs"`
}

func autoAssignTx(tx *sqlx.Tx, tenantID, jobID string) error {
	var pickupLat, pickupLng *float64
	_ = tx.QueryRow(`SELECT pickup_lat, pickup_lng FROM delivery_jobs WHERE id=$1`, jobID).Scan(&pickupLat, &pickupLng)

	var cands []candidate
	if err := tx.Select(&cands, `
		SELECT c.id, c.last_lat, c.last_lng, c.last_seen_at,
		       (SELECT COUNT(*) FROM delivery_jobs j
		        WHERE j.courier_id=c.id AND j.status IN ('assigned','accepted','at_pickup','picked_up','in_transit'))::int AS active_jobs
		FROM couriers c
		JOIN courier_shifts s ON s.courier_id=c.id AND s.status='open'
		WHERE c.status='active'
		  AND (c.last_seen_at IS NULL OR c.last_seen_at > NOW() - INTERVAL '2 hours')
		  AND (SELECT COUNT(*) FROM delivery_jobs j
		       WHERE j.courier_id=c.id AND j.status IN ('assigned','accepted','at_pickup','picked_up','in_transit')) < $1
		ORDER BY active_jobs ASC, c.last_seen_at ASC NULLS FIRST
	`, maxActiveJobsPerCourier); err != nil {
		return err
	}
	if len(cands) == 0 {
		return nil
	}
	best := cands[0]
	bestDist := math.MaxFloat64
	if pickupLat != nil && pickupLng != nil {
		// Prefer fewer active jobs; among the lightest load, pick closest.
		minLoad := cands[0].ActiveJobs
		for _, c := range cands {
			if c.ActiveJobs > minLoad {
				break
			}
			if c.LastLat == nil || c.LastLng == nil {
				continue
			}
			d := haversineKm(*pickupLat, *pickupLng, *c.LastLat, *c.LastLng)
			if d < bestDist {
				bestDist = d
				best = c
			}
		}
		if bestDist == math.MaxFloat64 {
			best = cands[0]
			for _, c := range cands {
				if c.ActiveJobs > minLoad {
					break
				}
				if c.LastSeenAt == nil {
					best = c
					break
				}
				if best.LastSeenAt == nil || c.LastSeenAt.Before(*best.LastSeenAt) {
					best = c
				}
			}
		}
	}
	seq := 0
	_ = tx.Get(&seq, `SELECT COALESCE(MAX(sequence),0)+1 FROM delivery_jobs WHERE courier_id=$1 AND status IN ('assigned','accepted','at_pickup','picked_up','in_transit')`, best.ID)
	_, err := tx.Exec(`
		UPDATE delivery_jobs SET courier_id=$1, status='assigned', assigned_at=NOW(), sequence=$2, updated_at=NOW()
		WHERE id=$3 AND status='pending_assign'`, best.ID, seq, jobID)
	if err != nil {
		return err
	}
	return addEvent(tx, tenantID, jobID, "pending_assign", "assigned", "system", "auto", "auto-assign")
}

// assignPendingJobsTx tries to place waiting jobs onto on-shift couriers (up to limit each).
func assignPendingJobsTx(tx *sqlx.Tx, tenantID string, limit int) {
	if limit <= 0 {
		limit = 20
	}
	var ids []string
	_ = tx.Select(&ids, `
		SELECT id::text FROM delivery_jobs
		WHERE status='pending_assign'
		ORDER BY created_at ASC
		LIMIT $1`, limit)
	for _, id := range ids {
		_ = autoAssignTx(tx, tenantID, id)
	}
}

type AutoAssignResult struct {
	Attempted int `json:"attempted"`
	Assigned  int `json:"assigned"`
	Pending   int `json:"pending"`
}

func (s *Service) AutoAssignPending(tenantID string, limit int) (*AutoAssignResult, error) {
	if limit <= 0 {
		limit = 20
	}
	res := &AutoAssignResult{}
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var ids []string
		if err := tx.Select(&ids, `
			SELECT id::text FROM delivery_jobs
			WHERE status='pending_assign'
			ORDER BY created_at ASC
			LIMIT $1`, limit); err != nil {
			return err
		}
		res.Attempted = len(ids)
		for _, id := range ids {
			var before string
			_ = tx.Get(&before, `SELECT status FROM delivery_jobs WHERE id=$1`, id)
			if before != "pending_assign" {
				continue
			}
			if err := autoAssignTx(tx, tenantID, id); err != nil {
				continue
			}
			var after string
			_ = tx.Get(&after, `SELECT status FROM delivery_jobs WHERE id=$1`, id)
			if after == "assigned" {
				res.Assigned++
			}
		}
		_ = tx.Get(&res.Pending, `SELECT COUNT(*)::int FROM delivery_jobs WHERE status='pending_assign'`)
		return nil
	})
	return res, err
}

func (s *Service) RetryAssign(tenantID, jobID string) (*model.Job, error) {
	var job model.Job
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var st string
		if err := tx.Get(&st, `SELECT status FROM delivery_jobs WHERE id=$1`, jobID); err != nil {
			return ErrNotFound
		}
		if st != "pending_assign" && st != "reassigned" {
			return fmt.Errorf("%w: job not awaiting assign", ErrBadRequest)
		}
		if st == "reassigned" {
			_, _ = tx.Exec(`UPDATE delivery_jobs SET status='pending_assign', courier_id=NULL, updated_at=NOW() WHERE id=$1`, jobID)
		}
		if err := autoAssignTx(tx, tenantID, jobID); err != nil {
			return err
		}
		return tx.Get(&job, jobSelect()+" WHERE j.id=$1", jobID)
	})
	return &job, err
}

func (s *Service) AdminAssign(tenantID, jobID, courierID, actorID string) (*model.Job, error) {
	if courierID == "" {
		return s.RetryAssign(tenantID, jobID)
	}
	var job model.Job
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var cst string
		if err := tx.Get(&cst, `SELECT status FROM couriers WHERE id=$1`, courierID); err != nil {
			return ErrNotFound
		}
		if cst != "active" {
			return fmt.Errorf("%w: courier not active", ErrBadRequest)
		}
		var st string
		if err := tx.Get(&st, `SELECT status FROM delivery_jobs WHERE id=$1`, jobID); err != nil {
			return ErrNotFound
		}
		from := st
		seq := 1
		_ = tx.Get(&seq, `SELECT COALESCE(MAX(sequence),0)+1 FROM delivery_jobs WHERE courier_id=$1 AND status IN ('assigned','accepted','at_pickup','picked_up','in_transit')`, courierID)
		_, err := tx.Exec(`
			UPDATE delivery_jobs SET courier_id=$1, status='assigned', assigned_at=NOW(), sequence=$2, updated_at=NOW()
			WHERE id=$3`, courierID, seq, jobID)
		if err != nil {
			return err
		}
		_ = addEvent(tx, tenantID, jobID, from, "assigned", "tenant_admin", actorID, "force assign")
		return tx.Get(&job, jobSelect()+" WHERE j.id=$1", jobID)
	})
	return &job, err
}

func (s *Service) Reassign(tenantID, jobID, courierID, actorID string) (*model.Job, error) {
	var job model.Job
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var cst string
		if err := tx.Get(&cst, `SELECT status FROM couriers WHERE id=$1`, courierID); err != nil {
			return ErrNotFound
		}
		if cst != "active" {
			return fmt.Errorf("%w: courier not active", ErrBadRequest)
		}
		var st string
		if err := tx.Get(&st, `SELECT status FROM delivery_jobs WHERE id=$1`, jobID); err != nil {
			return ErrNotFound
		}
		if st == "delivered" || st == "cancelled" {
			return fmt.Errorf("%w: cannot reassign", ErrBadRequest)
		}
		_, err := tx.Exec(`
			UPDATE delivery_jobs SET courier_id=$1, status='assigned', assigned_at=NOW(), accepted_at=NULL,
			  sequence=1, updated_at=NOW() WHERE id=$2`, courierID, jobID)
		if err != nil {
			return err
		}
		_ = addEvent(tx, tenantID, jobID, st, "assigned", "tenant_admin", actorID, "reassign")
		return tx.Get(&job, jobSelect()+" WHERE j.id=$1", jobID)
	})
	return &job, err
}

func (s *Service) ListJobs(tenantID, status, disputed string) ([]model.Job, error) {
	var out []model.Job
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		q := jobSelect() + " WHERE 1=1"
		args := []any{}
		if status != "" {
			args = append(args, status)
			q += fmt.Sprintf(" AND j.status=$%d", len(args))
		}
		if disputed == "true" || disputed == "1" {
			q += " AND j.cod_dispute=true"
		}
		q += " ORDER BY j.created_at DESC LIMIT 200"
		return tx.Select(&out, q, args...)
	})
	return out, err
}

func (s *Service) ListCourierJobs(tenantID, courierID, scope string) ([]model.Job, error) {
	var out []model.Job
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		q := jobSelect() + ` WHERE j.courier_id=$1`
		switch scope {
		case "history", "delivered":
			q += ` AND j.status='delivered' ORDER BY j.delivered_at DESC NULLS LAST, j.created_at DESC LIMIT 100`
		case "active":
			q += ` AND j.status IN ('assigned','accepted','at_pickup','picked_up','in_transit')
				ORDER BY j.sequence ASC, j.assigned_at ASC NULLS LAST LIMIT 100`
		default:
			q += ` AND j.status IN ('assigned','accepted','at_pickup','picked_up','in_transit','delivered')
				ORDER BY CASE WHEN j.status='delivered' THEN 1 ELSE 0 END, j.sequence, j.created_at DESC
				LIMIT 100`
		}
		return tx.Select(&out, q, courierID)
	})
	return out, err
}

type CourierEarnings struct {
	Currency          string  `json:"currency"`
	CompletedToday    int     `json:"completed_today"`
	CompletedWeek     int     `json:"completed_week"`
	CompletedMonth    int     `json:"completed_month"`
	CompletedTotal    int     `json:"completed_total"`
	EarnedToday       float64 `json:"earned_today"`
	EarnedWeek        float64 `json:"earned_week"`
	EarnedMonth       float64 `json:"earned_month"`
	EarnedUnpaid      float64 `json:"earned_unpaid"`
	PayoutPending     float64 `json:"payout_pending"`
	PayoutPaid        float64 `json:"payout_paid"`
	DefaultFee        float64 `json:"default_fee"`
}

func jobFeeSQL(alias string) string {
	if alias == "" {
		alias = "j"
	}
	return fmt.Sprintf("CASE WHEN %[1]s.delivery_fee > 0 THEN %[1]s.delivery_fee::float8 ELSE 15000 END", alias)
}

func (s *Service) CourierEarnings(tenantID, courierID string) (*CourierEarnings, error) {
	out := &CourierEarnings{Currency: "UZS", DefaultFee: 15000}
	fee := jobFeeSQL("j")
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		type row struct {
			N int     `db:"n"`
			A float64 `db:"a"`
		}
		var r row
		_ = tx.Get(&r, `
			SELECT COUNT(*)::int AS n, COALESCE(SUM(`+fee+`),0)::float8 AS a
			FROM delivery_jobs j
			WHERE j.courier_id=$1 AND j.status='delivered' AND j.delivered_at::date = CURRENT_DATE`, courierID)
		out.CompletedToday, out.EarnedToday = r.N, r.A
		_ = tx.Get(&r, `
			SELECT COUNT(*)::int AS n, COALESCE(SUM(`+fee+`),0)::float8 AS a
			FROM delivery_jobs j
			WHERE j.courier_id=$1 AND j.status='delivered'
			  AND j.delivered_at >= date_trunc('week', CURRENT_DATE)`, courierID)
		out.CompletedWeek, out.EarnedWeek = r.N, r.A
		_ = tx.Get(&r, `
			SELECT COUNT(*)::int AS n, COALESCE(SUM(`+fee+`),0)::float8 AS a
			FROM delivery_jobs j
			WHERE j.courier_id=$1 AND j.status='delivered'
			  AND j.delivered_at >= date_trunc('month', CURRENT_DATE)`, courierID)
		out.CompletedMonth, out.EarnedMonth = r.N, r.A
		_ = tx.Get(&r, `
			SELECT COUNT(*)::int AS n, COALESCE(SUM(`+fee+`),0)::float8 AS a
			FROM delivery_jobs j WHERE j.courier_id=$1 AND j.status='delivered'`, courierID)
		out.CompletedTotal = r.N
		_ = tx.Get(&out.EarnedUnpaid, `
			SELECT COALESCE(SUM(`+fee+`),0)::float8
			FROM delivery_jobs j
			WHERE j.courier_id=$1 AND j.status='delivered'
			  AND NOT EXISTS (SELECT 1 FROM courier_payout_items i WHERE i.job_id=j.id)`, courierID)
		_ = tx.Get(&out.PayoutPending, `
			SELECT COALESCE(SUM(amount),0)::float8 FROM courier_payouts
			WHERE courier_id=$1 AND status='pending'`, courierID)
		_ = tx.Get(&out.PayoutPaid, `
			SELECT COALESCE(SUM(amount),0)::float8 FROM courier_payouts
			WHERE courier_id=$1 AND status='paid'`, courierID)
		return nil
	})
	return out, err
}

func (s *Service) GetJob(tenantID, id string) (*model.Job, error) {
	var job model.Job
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&job, jobSelect()+" WHERE j.id=$1", id)
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &job, err
}

func (s *Service) GetJobByOrder(tenantID, orderID string) (*model.Job, error) {
	var job model.Job
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&job, jobSelect()+`
			WHERE j.order_id=$1
			ORDER BY j.created_at DESC LIMIT 1`, orderID)
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &job, err
}

type LiveCourier struct {
	Lat       float64    `json:"lat"`
	Lng       float64    `json:"lng"`
	UpdatedAt *time.Time `json:"updated_at,omitempty"`
}

type LiveTracking struct {
	JobStatus  string      `json:"job_status"`
	DropoffLat *float64    `json:"dropoff_lat"`
	DropoffLng *float64    `json:"dropoff_lng"`
	Courier    *LiveCourier `json:"courier"`
}

func (s *Service) LiveByOrder(tenantID, orderID string) (*LiveTracking, error) {
	job, err := s.GetJobByOrder(tenantID, orderID)
	if err != nil {
		return nil, err
	}
	out := &LiveTracking{
		JobStatus:  job.Status,
		DropoffLat: job.DropoffLat,
		DropoffLng: job.DropoffLng,
	}
	active := map[string]bool{
		"assigned": true, "accepted": true, "at_pickup": true, "picked_up": true, "in_transit": true,
	}
	if !active[job.Status] || job.CourierID == nil {
		return out, nil
	}
	co, err := s.GetCourier(tenantID, *job.CourierID)
	if err != nil || co.LastLat == nil || co.LastLng == nil || co.LastSeenAt == nil {
		return out, nil
	}
	if time.Since(*co.LastSeenAt) > 10*time.Minute {
		return out, nil
	}
	out.Courier = &LiveCourier{Lat: *co.LastLat, Lng: *co.LastLng, UpdatedAt: co.LastSeenAt}
	return out, nil
}

var courierTransitions = map[string]string{
	"accept":        "accepted",
	"arrive-pickup": "at_pickup",
	"picked-up":     "picked_up",
	"in-transit":    "in_transit",
	"delivered":     "delivered",
}

var allowedFrom = map[string][]string{
	"accepted":  {"assigned"},
	"at_pickup": {"accepted"},
	"picked_up": {"at_pickup", "accepted"},
	"in_transit": {"picked_up"},
	"delivered": {"in_transit", "picked_up"},
}

func (s *Service) TransitionJob(ctx context.Context, tenantID, jobID, courierID, action, actorRole, actorID, authHeader string) (*model.Job, error) {
	to, ok := courierTransitions[action]
	if !ok {
		return nil, fmt.Errorf("%w: unknown action", ErrBadRequest)
	}
	var job model.Job
	var orderID string
	var needShip, needTransit, needDeliver, needCOD bool
	var codAmount float64

	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		if err := tx.Get(&job, jobSelect()+" WHERE j.id=$1", jobID); err != nil {
			return ErrNotFound
		}
		if job.CourierID == nil || *job.CourierID != courierID {
			return ErrForbidden
		}
		allowed := allowedFrom[to]
		okFrom := false
		for _, a := range allowed {
			if job.Status == a {
				okFrom = true
				break
			}
		}
		if !okFrom {
			return fmt.Errorf("%w: cannot go from %s to %s", ErrBadRequest, job.Status, to)
		}
		orderID = job.OrderID
		codAmount = job.CODAmount
		sets := "status=$1, updated_at=NOW()"
		switch to {
		case "accepted":
			sets += ", accepted_at=NOW()"
		case "picked_up":
			sets += ", picked_up_at=NOW()"
			needShip = true
		case "in_transit":
			needTransit = true
		case "delivered":
			sets += ", delivered_at=NOW()"
			needDeliver = true
			needCOD = codAmount > 0
		}
		_, err := tx.Exec(`UPDATE delivery_jobs SET `+sets+` WHERE id=$2`, to, jobID)
		if err != nil {
			return err
		}
		_ = addEvent(tx, tenantID, jobID, job.Status, to, actorRole, actorID, action)
		return tx.Get(&job, jobSelect()+" WHERE j.id=$1", jobID)
	})
	if err != nil {
		return nil, err
	}

	if needCOD {
		// Check payment status; if unpaid COD, collect via payments
		var payStatus string
		_ = s.withTenant(tenantID, func(tx *sqlx.Tx) error {
			return tx.Get(&payStatus, `SELECT COALESCE(payment_status,'unpaid') FROM orders WHERE id=$1`, orderID)
		})
		if payStatus != "paid" {
			if err := s.collectCOD(ctx, orderID, tenantID, authHeader); err != nil {
				// rollback job status to in_transit
				_ = s.withTenant(tenantID, func(tx *sqlx.Tx) error {
					_, e := tx.Exec(`UPDATE delivery_jobs SET status='in_transit', delivered_at=NULL, updated_at=NOW() WHERE id=$1`, jobID)
					return e
				})
				return nil, fmt.Errorf("%w: %v", ErrPaymentPending, err)
			}
		}
	}

	if needShip {
		_ = s.syncOrderShipped(tenantID, orderID, jobID)
	}
	if needTransit {
		_ = s.syncOrderInTransit(tenantID, orderID, jobID)
	}
	if needDeliver {
		_ = s.withTenant(tenantID, func(tx *sqlx.Tx) error {
			var st, pay string
			if err := tx.Get(&st, `SELECT status FROM orders WHERE id=$1`, orderID); err != nil {
				return err
			}
			_ = tx.Get(&pay, `SELECT COALESCE(payment_status,'unpaid') FROM orders WHERE id=$1`, orderID)
			if pay != "paid" {
				return ErrPaymentPending
			}
			if st == "shipped" {
				if _, err := tx.Exec(`UPDATE orders SET status='delivered', fulfillment_status='fulfilled', updated_at=NOW() WHERE id=$1`, orderID); err != nil {
					return err
				}
			}
			assignPendingJobsTx(tx, tenantID, 20)
			return nil
		})
	}
	return s.GetJob(tenantID, jobID)
}

func (s *Service) syncOrderShipped(tenantID, orderID, jobID string) error {
	return s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var st string
		if err := tx.Get(&st, `SELECT status FROM orders WHERE id=$1`, orderID); err != nil {
			return err
		}
		if st == "processing" {
			_, err := tx.Exec(`
				UPDATE orders SET status='shipped', fulfillment_status='shipped', tracking_carrier='platform_courier',
				  tracking_number=$1, shipped_at=NOW(), updated_at=NOW() WHERE id=$2`, jobID[:8], orderID)
			return err
		}
		return nil
	})
}

func (s *Service) syncOrderInTransit(tenantID, orderID, jobID string) error {
	return s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var st string
		if err := tx.Get(&st, `SELECT status FROM orders WHERE id=$1`, orderID); err != nil {
			return err
		}
		switch st {
		case "processing":
			_, err := tx.Exec(`
				UPDATE orders SET status='shipped', fulfillment_status='shipped', tracking_carrier='platform_courier',
				  tracking_number=$1, shipped_at=COALESCE(shipped_at, NOW()), updated_at=NOW() WHERE id=$2`, jobID[:8], orderID)
			return err
		case "shipped":
			_, err := tx.Exec(`
				UPDATE orders SET fulfillment_status='shipped',
				  tracking_carrier=COALESCE(NULLIF(tracking_carrier,''),'platform_courier'),
				  tracking_number=COALESCE(NULLIF(tracking_number,''),$1), updated_at=NOW() WHERE id=$2`, jobID[:8], orderID)
			return err
		default:
			return nil
		}
	})
}

func (s *Service) collectCOD(ctx context.Context, orderID, tenantID, authHeader string) error {
	body, _ := json.Marshal(map[string]string{"order_id": orderID})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.PaymentsURL+"/v1/payments/collect", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", tenantID)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	resp, err := s.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("payments collect failed: %s", string(b))
	}
	return nil
}

func (s *Service) CollectCODProxy(ctx context.Context, tenantID, jobID, courierID, authHeader string, collectedAmount *float64) (*model.Job, error) {
	job, err := s.GetJob(tenantID, jobID)
	if err != nil {
		return nil, err
	}
	if job.CourierID == nil || *job.CourierID != courierID {
		return nil, ErrForbidden
	}
	var orderTotal float64
	_ = s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&orderTotal, `SELECT total::float8 FROM orders WHERE id=$1`, job.OrderID)
	})
	expected := job.CODAmount
	if expected <= 0 {
		expected = orderTotal
	}
	dispute := false
	note := ""
	amount := expected
	if collectedAmount != nil && *collectedAmount > 0 {
		amount = *collectedAmount
		if amount != expected && amount != orderTotal {
			dispute = true
			note = fmt.Sprintf("collected %.2f expected %.2f order %.2f", amount, expected, orderTotal)
		}
	}
	if err := s.collectCOD(ctx, job.OrderID, tenantID, authHeader); err != nil {
		return nil, err
	}
	err = s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		meta := map[string]any{}
		if len(job.Metadata) > 0 {
			_ = json.Unmarshal(job.Metadata, &meta)
		}
		if dispute {
			meta["cod_dispute"] = true
			meta["cod_collected_amount"] = amount
			meta["cod_expected_amount"] = expected
		}
		metaJSON, _ := json.Marshal(meta)
		_, e := tx.Exec(`
			UPDATE delivery_jobs SET cod_collected_amount=$1, cod_dispute=$2, cod_dispute_note=$3,
			  metadata=$4, updated_at=NOW() WHERE id=$5`,
			amount, dispute, note, metaJSON, jobID)
		if e != nil {
			return e
		}
		if dispute {
			_ = addEvent(tx, tenantID, jobID, job.Status, job.Status, "courier", courierID, "cod-dispute")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetJob(tenantID, jobID)
}

func (s *Service) CourierRoute(tenantID, courierID string) ([]model.Job, error) {
	var out []model.Job
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&out, jobSelect()+`
			WHERE j.courier_id=$1 AND j.status IN ('assigned','accepted','at_pickup','picked_up','in_transit')
			ORDER BY j.sequence ASC, j.assigned_at ASC NULLS LAST`, courierID)
	})
	return out, err
}

// --- Messages ---

func normalizeToRole(to string) string {
	switch strings.TrimSpace(strings.ToLower(to)) {
	case "", "all", "everyone":
		return "all"
	case "customer", "buyer":
		return "customer"
	case "vendor", "seller":
		return "vendor"
	case "courier":
		return "courier"
	case "tenant_admin", "admin", "manager", "super_admin":
		return "tenant_admin"
	default:
		return "all"
	}
}

func normalizeViewerRole(role string) string {
	switch strings.TrimSpace(strings.ToLower(role)) {
	case "buyer", "customer":
		return "customer"
	case "seller", "vendor":
		return "vendor"
	case "courier":
		return "courier"
	case "tenant_admin", "admin", "manager", "super_admin":
		return "tenant_admin"
	default:
		return strings.TrimSpace(strings.ToLower(role))
	}
}

func isAdminViewer(role string) bool {
	r := normalizeViewerRole(role)
	return r == "tenant_admin" || r == "manager" || r == "super_admin"
}

// resolveToRole maps broadcast "all" to a concrete peer so threads stay separated.
// Admins may still broadcast with to_role=all.
func resolveToRole(senderRole, toRole string) string {
	sender := normalizeViewerRole(senderRole)
	to := normalizeToRole(toRole)
	if to != "all" {
		return to
	}
	if isAdminViewer(sender) {
		return "all"
	}
	switch sender {
	case "customer", "vendor":
		return "courier"
	case "courier":
		return "customer"
	default:
		return "courier"
	}
}

// messageVisibleTo implements separated threads:
//   customer ↔ courier  |  vendor ↔ courier  |  admin can see/send across
// Legacy to_role=all from courier is treated as customer-facing (not vendor).
func messageVisibleTo(senderRole, toRole, viewerRole, thread string) bool {
	sender := normalizeViewerRole(senderRole)
	to := normalizeToRole(toRole)
	viewer := normalizeViewerRole(viewerRole)
	thread = strings.TrimSpace(strings.ToLower(thread))

	effectiveTo := to
	if to == "all" && !isAdminViewer(sender) {
		effectiveTo = resolveToRole(sender, "all")
	}

	customerThread := messageInCustomerThread(sender, to, effectiveTo)
	vendorThread := messageInVendorThread(sender, to, effectiveTo)

	switch viewer {
	case "customer":
		return customerThread
	case "vendor":
		return vendorThread
	case "courier":
		switch thread {
		case "vendor":
			return vendorThread
		case "customer":
			return customerThread
		default:
			return customerThread || vendorThread
		}
	default:
		if isAdminViewer(viewer) {
			switch thread {
			case "vendor":
				return vendorThread
			case "customer":
				return customerThread
			default:
				return true
			}
		}
		return false
	}
}

func messageInCustomerThread(sender, to, effectiveTo string) bool {
	// Must not include vendor as party.
	if sender == "vendor" || to == "vendor" || effectiveTo == "vendor" {
		return false
	}
	if sender == "customer" || effectiveTo == "customer" || to == "customer" {
		return true
	}
	// courier → all (legacy) counts as customer thread
	if sender == "courier" && to == "all" {
		return true
	}
	// admin → customer / all
	if isAdminViewer(sender) && (to == "customer" || to == "all" || effectiveTo == "customer") {
		return true
	}
	return false
}

func messageInVendorThread(sender, to, effectiveTo string) bool {
	if sender == "customer" || to == "customer" || effectiveTo == "customer" {
		return false
	}
	// courier → all is customer thread, not vendor
	if sender == "courier" && to == "all" {
		return false
	}
	if sender == "vendor" || effectiveTo == "vendor" || to == "vendor" {
		return true
	}
	if isAdminViewer(sender) && (to == "vendor" || to == "all") {
		return true
	}
	return false
}

func (s *Service) ListMessages(tenantID, jobID, viewerRole, thread string) ([]model.Message, error) {
	var raw []model.Message
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&raw, `
			SELECT id, tenant_id, job_id, sender_role, sender_id, COALESCE(to_role,'all') AS to_role, body, created_at
			FROM delivery_messages WHERE job_id=$1 ORDER BY created_at ASC LIMIT 500`, jobID)
	})
	if err != nil {
		return nil, err
	}
	viewer := normalizeViewerRole(viewerRole)
	out := make([]model.Message, 0, len(raw))
	for _, m := range raw {
		if messageVisibleTo(m.SenderRole, m.ToRole, viewer, thread) {
			out = append(out, m)
		}
	}
	return out, nil
}

func (s *Service) PostMessage(tenantID, jobID, role, senderID, body, toRole string) (*model.Message, error) {
	body = strings.TrimSpace(body)
	body = strings.Map(func(r rune) rune {
		if r == 0 || r == '\uFEFF' {
			return -1
		}
		return r
	}, body)
	if body == "" {
		return nil, fmt.Errorf("%w: empty body", ErrBadRequest)
	}
	if len([]rune(body)) > 2000 {
		return nil, fmt.Errorf("%w: message too long", ErrBadRequest)
	}
	role = normalizeViewerRole(role)
	if role == "" {
		role = "customer"
	}
	toRole = resolveToRole(role, toRole)

	// Block cross-talk that would leak into the wrong storefront thread.
	if role == "vendor" && toRole == "customer" {
		// vendor may message customer explicitly — allowed, customer thread
	}
	if role == "customer" && toRole == "vendor" {
		return nil, fmt.Errorf("%w: customers message the courier, not the vendor via delivery chat", ErrBadRequest)
	}

	var m model.Message
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var exists string
		if err := tx.Get(&exists, `SELECT id::text FROM delivery_jobs WHERE id=$1`, jobID); err != nil {
			return ErrNotFound
		}
		id := uuid.NewString()
		_, err := tx.Exec(`
			INSERT INTO delivery_messages (id, tenant_id, job_id, sender_role, sender_id, to_role, body)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, tenantID, jobID, role, senderID, toRole, body)
		if err != nil {
			return err
		}
		return tx.Get(&m, `
			SELECT id, tenant_id, job_id, sender_role, sender_id, COALESCE(to_role,'all') AS to_role, body, created_at
			FROM delivery_messages WHERE id=$1`, id)
	})
	return &m, err
}

// --- Ratings ---

func (s *Service) RateCourier(tenantID, orderID, customerID string, score int, comment string) (*model.Rating, error) {
	if score < 1 || score > 5 {
		return nil, fmt.Errorf("%w: score 1-5", ErrBadRequest)
	}
	var r model.Rating
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var jobID, courierID string
		if err := tx.QueryRow(`
			SELECT id::text, courier_id::text FROM delivery_jobs
			WHERE order_id=$1 AND status='delivered' AND courier_id IS NOT NULL
			ORDER BY created_at DESC LIMIT 1`, orderID).Scan(&jobID, &courierID); err != nil {
			return ErrNotFound
		}
		id := uuid.NewString()
		var cust *string
		if customerID != "" {
			cust = &customerID
		}
		var existingCust sql.NullString
		_ = tx.Get(&existingCust, `SELECT customer_id::text FROM courier_ratings WHERE job_id=$1`, jobID)
		if existingCust.Valid && existingCust.String != "" && customerID != "" && existingCust.String != customerID {
			return fmt.Errorf("%w: rating already submitted", ErrForbidden)
		}
		comment = strings.TrimSpace(comment)
		if len([]rune(comment)) > 1000 {
			comment = string([]rune(comment)[:1000])
		}
		_, err := tx.Exec(`
			INSERT INTO courier_ratings (id, tenant_id, job_id, order_id, customer_id, courier_id, score, comment)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
			ON CONFLICT (job_id) DO UPDATE SET score=EXCLUDED.score, comment=EXCLUDED.comment
			  WHERE courier_ratings.customer_id IS NULL OR courier_ratings.customer_id::text = EXCLUDED.customer_id::text`,
			id, tenantID, jobID, orderID, cust, courierID, score, comment)
		if err != nil {
			return err
		}
		_, err = tx.Exec(`
			UPDATE couriers SET
			  rating_count = (SELECT COUNT(*) FROM courier_ratings WHERE courier_id=$1),
			  rating_avg = (SELECT COALESCE(AVG(score),0) FROM courier_ratings WHERE courier_id=$1),
			  updated_at=NOW()
			WHERE id=$1`, courierID)
		if err != nil {
			return err
		}
		return tx.Get(&r, `SELECT id, tenant_id, job_id, order_id, customer_id, courier_id, score, comment, created_at FROM courier_ratings WHERE job_id=$1`, jobID)
	})
	return &r, err
}

func (s *Service) ListRatings(tenantID string) ([]model.Rating, error) {
	var out []model.Rating
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&out, `SELECT id, tenant_id, job_id, order_id, customer_id, courier_id, score, comment, created_at FROM courier_ratings ORDER BY created_at DESC LIMIT 200`)
	})
	return out, err
}

// --- Payouts ---

func (s *Service) CreatePayout(tenantID, courierID, periodStart, periodEnd, note string) (*model.Payout, error) {
	var p model.Payout
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var jobs []struct {
			ID  string  `db:"id"`
			Fee float64 `db:"delivery_fee"`
		}
		if err := tx.Select(&jobs, `
			SELECT j.id, j.delivery_fee::float8 AS delivery_fee
			FROM delivery_jobs j
			WHERE j.courier_id=$1 AND j.status='delivered'
			  AND j.delivered_at::date >= $2::date AND j.delivered_at::date <= $3::date
			  AND NOT EXISTS (SELECT 1 FROM courier_payout_items i WHERE i.job_id=j.id)`, courierID, periodStart, periodEnd); err != nil {
			return err
		}
		if len(jobs) == 0 {
			return fmt.Errorf("%w: no unpaid delivered jobs in period", ErrBadRequest)
		}
		var total float64
		for _, j := range jobs {
			fee := j.Fee
			if fee <= 0 {
				fee = 15000 // default platform courier fee share
			}
			total += fee
		}
		id := uuid.NewString()
		_, err := tx.Exec(`
			INSERT INTO courier_payouts (id, tenant_id, courier_id, period_start, period_end, amount, currency, status, note)
			VALUES ($1,$2,$3,$4::date,$5::date,$6,'UZS','pending',$7)`, id, tenantID, courierID, periodStart, periodEnd, total, note)
		if err != nil {
			return err
		}
		for _, j := range jobs {
			fee := j.Fee
			if fee <= 0 {
				fee = 15000
			}
			_, err = tx.Exec(`INSERT INTO courier_payout_items (id, tenant_id, payout_id, job_id, amount) VALUES ($1,$2,$3,$4,$5)`,
				uuid.NewString(), tenantID, id, j.ID, fee)
			if err != nil {
				return err
			}
		}
		return tx.Get(&p, `
			SELECT p.id, p.tenant_id, p.courier_id, p.period_start::text, p.period_end::text, p.amount::float8 AS amount,
			       p.currency, p.status, p.paid_at, p.note, p.created_at, COALESCE(c.full_name,'') AS courier_name
			FROM courier_payouts p LEFT JOIN couriers c ON c.id=p.courier_id WHERE p.id=$1`, id)
	})
	return &p, err
}

func (s *Service) MarkPayoutPaid(tenantID, id string) (*model.Payout, error) {
	var p model.Payout
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		res, err := tx.Exec(`UPDATE courier_payouts SET status='paid', paid_at=NOW(), updated_at=NOW() WHERE id=$1`, id)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return ErrNotFound
		}
		return tx.Get(&p, `
			SELECT p.id, p.tenant_id, p.courier_id, p.period_start::text, p.period_end::text, p.amount::float8 AS amount,
			       p.currency, p.status, p.paid_at, p.note, p.created_at, COALESCE(c.full_name,'') AS courier_name
			FROM courier_payouts p LEFT JOIN couriers c ON c.id=p.courier_id WHERE p.id=$1`, id)
	})
	return &p, err
}

func (s *Service) ListPayouts(tenantID, courierID string) ([]model.Payout, error) {
	var out []model.Payout
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		q := `
			SELECT p.id, p.tenant_id, p.courier_id, p.period_start::text, p.period_end::text, p.amount::float8 AS amount,
			       p.currency, p.status, p.paid_at, p.note, p.created_at, COALESCE(c.full_name,'') AS courier_name
			FROM courier_payouts p LEFT JOIN couriers c ON c.id=p.courier_id WHERE 1=1`
		args := []any{}
		if courierID != "" {
			args = append(args, courierID)
			q += fmt.Sprintf(" AND p.courier_id=$%d", len(args))
		}
		q += " ORDER BY p.created_at DESC LIMIT 100"
		return tx.Select(&out, q, args...)
	})
	return out, err
}

func (s *Service) AdminShifts(tenantID string) ([]model.Shift, error) {
	var out []model.Shift
	err := s.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&out, `SELECT id, tenant_id, courier_id, started_at, ended_at, status FROM courier_shifts WHERE status='open' ORDER BY started_at DESC`)
	})
	return out, err
}
