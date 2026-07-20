package handler

import (
	"encoding/json"
	"os"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/vendor-service/internal/model"
	"github.com/gayrat/marketplace/services/vendor-service/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type VendorHandler struct{ Service *service.VendorService }
type Vendor = model.Vendor

func (h *VendorHandler) Apply(c *gin.Context)          { apply(c, h.Service.Repo.DB, h.Service.Producer) }
func (h *VendorHandler) List(c *gin.Context)           { listVendors(c, h.Service.Repo.DB) }
func (h *VendorHandler) AdminList(c *gin.Context)      { listAllVendors(c, h.Service.Repo.DB) }
func (h *VendorHandler) TenantMode(c *gin.Context)     { tenantMode(c, h.Service.Repo.DB) }
func (h *VendorHandler) Get(c *gin.Context)            { getVendor(c, h.Service.Repo.DB) }
func (h *VendorHandler) Products(c *gin.Context)       { vendorProducts(c, h.Service.Repo.DB) }
func (h *VendorHandler) Reviews(c *gin.Context)        { vendorReviews(c, h.Service.Repo.DB) }
func (h *VendorHandler) Stats(c *gin.Context)          { stats(c, h.Service.Repo.DB) }
func (h *VendorHandler) Orders(c *gin.Context)         { vendorOrders(c, h.Service.Repo.DB) }
func (h *VendorHandler) MyProducts(c *gin.Context)     { myProducts(c, h.Service.Repo.DB) }
func (h *VendorHandler) Payouts(c *gin.Context)        { payouts(c, h.Service.Repo.DB) }
func (h *VendorHandler) Settings(c *gin.Context)       { settings(c, h.Service.Repo.DB) }
func (h *VendorHandler) UpdateSettings(c *gin.Context) { updateSettings(c, h.Service.Repo.DB) }
func (h *VendorHandler) UpdateTenantSettings(c *gin.Context) {
	updateTenantSettings(c, h.Service.Repo.DB)
}
func (h *VendorHandler) Approve(c *gin.Context)        { setStatus(c, h.Service.Repo.DB, "active", true) }
func (h *VendorHandler) Suspend(c *gin.Context)        { setStatus(c, h.Service.Repo.DB, "suspended", false) }
func (h *VendorHandler) SetCommission(c *gin.Context)  { setCommission(c, h.Service.Repo.DB) }
func (h *VendorHandler) SwitchMode(c *gin.Context)     { switchMode(c, h.Service.Repo.DB) }
func (h *VendorHandler) RunPayouts(c *gin.Context)     { runPayouts(c, h.Service.Repo.DB) }

func apply(c *gin.Context, database *sqlx.DB, producer *kafkax.Producer) {
	var body struct {
		Name         string          `json:"name" binding:"required"`
		Slug         string          `json:"slug" binding:"required"`
		Description  string          `json:"description"`
		Translations json.RawMessage `json:"translations"`
		BankDetails  json.RawMessage `json:"bank_details"`
		KYCDocuments json.RawMessage `json:"kyc_documents"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if body.Translations == nil {
		body.Translations = json.RawMessage(`{}`)
	}
	if body.BankDetails == nil {
		body.BankDetails = json.RawMessage(`{}`)
	}
	if body.KYCDocuments == nil {
		body.KYCDocuments = json.RawMessage(`[]`)
	}
	claims := middleware.GetClaims(c)
	id := uuid.NewString()
	_, err := database.Exec(`INSERT INTO vendors (id, tenant_id, user_id, name, slug, description, translations, bank_details, kyc_documents, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')`, id, middleware.GetTenantID(c), claims.UserID, body.Name, body.Slug, body.Description, body.Translations, body.BankDetails, body.KYCDocuments)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	_, _ = database.Exec(`UPDATE users SET role='vendor' WHERE id=$1`, claims.UserID)
	_ = producer.Publish(c.Request.Context(), "vendor.registered", id, gin.H{"vendor_id": id, "user_id": claims.UserID})
	httpx.Created(c, gin.H{"id": id, "status": "pending"})
}
func listVendors(c *gin.Context, database *sqlx.DB) {
	var items []Vendor
	err := database.Select(&items, `SELECT id, tenant_id, user_id, name, slug, description, translations, logo_url, banner_url, commission_rate, status, kyc_verified, rating, review_count, created_at FROM vendors WHERE tenant_id=$1 AND status='active' ORDER BY rating DESC`, middleware.GetTenantID(c))
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": items})
}
func listAllVendors(c *gin.Context, database *sqlx.DB) {
	var items []Vendor
	err := database.Select(&items, `SELECT id, tenant_id, user_id, name, slug, description, translations, logo_url, banner_url, commission_rate, status, kyc_verified, rating, review_count, created_at FROM vendors WHERE tenant_id=$1 ORDER BY created_at DESC`, middleware.GetTenantID(c))
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": items})
}
func tenantMode(c *gin.Context, database *sqlx.DB) {
	var mode string
	if err := database.Get(&mode, `SELECT mode FROM tenants WHERE id=$1`, middleware.GetTenantID(c)); err != nil {
		httpx.OK(c, gin.H{"mode": "multi_vendor"})
		return
	}
	httpx.OK(c, gin.H{"mode": mode})
}
func getVendor(c *gin.Context, database *sqlx.DB) {
	var v Vendor
	err := database.Get(&v, `SELECT id, tenant_id, user_id, name, slug, description, translations, logo_url, banner_url, commission_rate, status, kyc_verified, rating, review_count, created_at FROM vendors WHERE tenant_id=$1 AND slug=$2`, middleware.GetTenantID(c), c.Param("slug"))
	if err != nil {
		httpx.NotFound(c, "vendor not found")
		return
	}
	var bankRaw []byte
	_ = database.Get(&bankRaw, `SELECT COALESCE(bank_details,'{}') FROM vendors WHERE id=$1`, v.ID)
	var bank map[string]any
	_ = json.Unmarshal(bankRaw, &bank)
	var policies any
	if bank != nil {
		policies = bank["policies"]
	}
	httpx.OK(c, gin.H{
		"id": v.ID, "tenant_id": v.TenantID, "user_id": v.UserID, "name": v.Name, "slug": v.Slug,
		"description": v.Description, "translations": v.Translations, "logo_url": v.LogoURL, "banner_url": v.BannerURL,
		"commission_rate": v.CommissionRate, "status": v.Status, "kyc_verified": v.KYCVerified,
		"rating": v.Rating, "review_count": v.ReviewCount, "created_at": v.CreatedAt, "policies": policies,
	})
}
func vendorProducts(c *gin.Context, database *sqlx.DB) {
	var vendorID string
	if err := database.Get(&vendorID, `SELECT id FROM vendors WHERE tenant_id=$1 AND slug=$2`, middleware.GetTenantID(c), c.Param("slug")); err != nil {
		httpx.NotFound(c, "vendor not found")
		return
	}
	rows, err := database.Queryx(`SELECT id, slug, translations, price, currency, images, status FROM products WHERE vendor_id=$1 AND status='active' LIMIT 50`, vendorID)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	defer rows.Close()
	items := maps(rows)
	httpx.OK(c, gin.H{"items": items})
}
func vendorReviews(c *gin.Context, database *sqlx.DB) {
	var vendorID string
	_ = database.Get(&vendorID, `SELECT id FROM vendors WHERE slug=$1`, c.Param("slug"))
	rows, _ := database.Queryx(`SELECT id, rating, title, body, vendor_reply, created_at FROM reviews WHERE vendor_id=$1 AND status='approved' ORDER BY created_at DESC LIMIT 50`, vendorID)
	defer rows.Close()
	httpx.OK(c, gin.H{"items": maps(rows)})
}
func maps(rows *sqlx.Rows) []map[string]any {
	var items []map[string]any
	for rows.Next() {
		m := map[string]any{}
		_ = rows.MapScan(m)
		items = append(items, m)
	}
	return items
}
func resolveVendorID(c *gin.Context, database *sqlx.DB) (string, error) {
	claims := middleware.GetClaims(c)
	if claims.Role == commonauth.RoleTenantAdmin {
		if id := c.Query("vendor_id"); id != "" {
			return id, nil
		}
	}
	var id string
	err := database.Get(&id, `SELECT id FROM vendors WHERE user_id=$1 AND tenant_id=$2 LIMIT 1`, claims.UserID, middleware.GetTenantID(c))
	return id, err
}
func stats(c *gin.Context, database *sqlx.DB) {
	vid, err := resolveVendorID(c, database)
	if err != nil {
		httpx.NotFound(c, "vendor not found")
		return
	}
	var revenue float64
	var orders int
	_ = database.Get(&revenue, `SELECT COALESCE(SUM(total_price - commission_amount),0) FROM order_items WHERE vendor_id=$1`, vid)
	_ = database.Get(&orders, `SELECT COUNT(DISTINCT order_id) FROM order_items WHERE vendor_id=$1`, vid)
	httpx.OK(c, gin.H{"vendor_id": vid, "revenue": revenue, "orders": orders, "currency": "UZS"})
}
func vendorOrders(c *gin.Context, database *sqlx.DB) {
	vid, err := resolveVendorID(c, database)
	if err != nil {
		httpx.NotFound(c, "vendor not found")
		return
	}
	rows, _ := database.Queryx(`SELECT oi.order_id, oi.title, oi.quantity, oi.total_price, oi.status, o.created_at FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.vendor_id=$1 ORDER BY o.created_at DESC LIMIT 50`, vid)
	defer rows.Close()
	httpx.OK(c, gin.H{"items": maps(rows)})
}
func myProducts(c *gin.Context, database *sqlx.DB) {
	vid, err := resolveVendorID(c, database)
	if err != nil {
		httpx.NotFound(c, "vendor not found")
		return
	}
	rows, _ := database.Queryx(`SELECT id, slug, translations, price, status, inventory_quantity FROM products WHERE vendor_id=$1 ORDER BY created_at DESC`, vid)
	defer rows.Close()
	httpx.OK(c, gin.H{"items": maps(rows)})
}
func payouts(c *gin.Context, database *sqlx.DB) {
	vid, err := resolveVendorID(c, database)
	if err != nil {
		httpx.NotFound(c, "vendor not found")
		return
	}
	rows, _ := database.Queryx(`SELECT id, amount, commission_total, currency, status, period_start, period_end, created_at FROM vendor_payouts WHERE vendor_id=$1 ORDER BY created_at DESC`, vid)
	defer rows.Close()
	httpx.OK(c, gin.H{"items": maps(rows)})
}
func settings(c *gin.Context, database *sqlx.DB) {
	vid, err := resolveVendorID(c, database)
	if err != nil {
		httpx.NotFound(c, "vendor not found")
		return
	}
	var name, slug, status string
	var description, logo, banner *string
	var bankRaw, kycRaw []byte
	err = database.QueryRow(`SELECT name, slug, description, logo_url, banner_url, status, COALESCE(bank_details,'{}'), COALESCE(kyc_documents,'[]') FROM vendors WHERE id=$1`, vid).
		Scan(&name, &slug, &description, &logo, &banner, &status, &bankRaw, &kycRaw)
	if err != nil {
		httpx.NotFound(c, "vendor not found")
		return
	}
	var bank map[string]any
	_ = json.Unmarshal(bankRaw, &bank)
	var kycDocs any
	_ = json.Unmarshal(kycRaw, &kycDocs)
	httpx.OK(c, gin.H{
		"id": vid, "name": name, "slug": slug, "description": description,
		"logo_url": logo, "banner_url": banner, "status": status,
		"bank_name": bank["bank_name"], "bank_account": bank["bank_account"], "policies": bank["policies"],
		"kyc_documents": kycDocs,
	})
}
func updateSettings(c *gin.Context, database *sqlx.DB) {
	vid, err := resolveVendorID(c, database)
	if err != nil {
		httpx.NotFound(c, "vendor not found")
		return
	}
	var body struct {
		Name         *string         `json:"name"`
		Description  *string         `json:"description"`
		LogoURL      *string         `json:"logo_url"`
		BannerURL    *string         `json:"banner_url"`
		BankName     *string         `json:"bank_name"`
		BankAccount  *string         `json:"bank_account"`
		Policies     *string         `json:"policies"`
		KYCDocuments json.RawMessage `json:"kyc_documents"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	bank := map[string]any{}
	if body.BankName != nil {
		bank["bank_name"] = *body.BankName
	}
	if body.BankAccount != nil {
		bank["bank_account"] = *body.BankAccount
	}
	if body.Policies != nil {
		bank["policies"] = *body.Policies
	}
	bankPatch, _ := json.Marshal(bank)
	_, err = database.Exec(`UPDATE vendors SET
		name=COALESCE($1,name),
		description=COALESCE($2,description),
		logo_url=COALESCE($3,logo_url),
		banner_url=COALESCE($4,banner_url),
		kyc_documents=COALESCE($5,kyc_documents),
		bank_details = COALESCE(bank_details,'{}'::jsonb) || $6::jsonb,
		updated_at=NOW()
		WHERE id=$7`, body.Name, body.Description, body.LogoURL, body.BannerURL, body.KYCDocuments, string(bankPatch), vid)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"updated": true})
}
func setStatus(c *gin.Context, database *sqlx.DB, status string, kyc bool) {
	if status == "active" && kyc {
		var docs json.RawMessage
		_ = database.Get(&docs, `SELECT COALESCE(kyc_documents,'[]') FROM vendors WHERE id=$1 AND tenant_id=$2`, c.Param("id"), middleware.GetTenantID(c))
		empty := len(docs) == 0 || string(docs) == "null" || string(docs) == "[]"
		if empty && os.Getenv("APP_ENV") != "development" && os.Getenv("APP_ENV") != "" && os.Getenv("APP_ENV") != "dev" {
			httpx.BadRequest(c, "kyc documents required before approve")
			return
		}
	}
	_, err := database.Exec(`UPDATE vendors SET status=$1, kyc_verified=$2, updated_at=NOW() WHERE id=$3 AND tenant_id=$4`, status, kyc, c.Param("id"), middleware.GetTenantID(c))
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"status": status})
}
func setCommission(c *gin.Context, database *sqlx.DB) {
	var body struct {
		Rate float64 `json:"rate" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	_, _ = database.Exec(`UPDATE vendors SET commission_rate=$1 WHERE id=$2`, body.Rate, c.Param("id"))
	httpx.OK(c, gin.H{"commission_rate": body.Rate})
}
func switchMode(c *gin.Context, database *sqlx.DB) {
	var body struct {
		Mode string `json:"mode" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if body.Mode != "single_store" && body.Mode != "multi_vendor" {
		httpx.BadRequest(c, "mode must be single_store or multi_vendor")
		return
	}
	tenantID := middleware.GetTenantID(c)
	tx, err := database.Beginx()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	defer tx.Rollback()
	_, err = tx.Exec(`UPDATE tenants SET mode=$1, updated_at=NOW() WHERE id=$2`, body.Mode, tenantID)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if body.Mode == "single_store" {
		if _, err := tx.Exec(`UPDATE products SET vendor_id=NULL, updated_at=NOW() WHERE tenant_id=$1`, tenantID); err != nil {
			httpx.Internal(c, err.Error())
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"mode": body.Mode, "migrated": true})
}

func updateTenantSettings(c *gin.Context, database *sqlx.DB) {
	var settings json.RawMessage
	if err := c.ShouldBindJSON(&settings); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if !json.Valid(settings) || len(settings) == 0 || settings[0] != '{' {
		httpx.BadRequest(c, "settings must be a JSON object")
		return
	}
	_, err := database.Exec(
		`UPDATE tenants SET settings=$1, updated_at=NOW() WHERE id=$2`,
		settings, middleware.GetTenantID(c),
	)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"settings": json.RawMessage(settings), "updated": true})
}

func runPayouts(c *gin.Context, database *sqlx.DB) {
	tenantID := middleware.GetTenantID(c)
	tx, err := database.Beginx()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	defer func() { _ = tx.Rollback() }()

	type row struct {
		VendorID   string  `db:"vendor_id"`
		Amount     float64 `db:"amount"`
		Commission float64 `db:"commission"`
	}
	var rows []row
	// Only settle pending splits tied to succeeded payments (no order_items fallback).
	err = tx.Select(&rows, `
		SELECT ps.vendor_id::text AS vendor_id,
			COALESCE(SUM(ps.vendor_amount),0) AS amount,
			COALESCE(SUM(ps.commission_amount),0) AS commission
		FROM payment_splits ps
		JOIN payments p ON p.id = ps.payment_id
		WHERE ps.tenant_id=$1
			AND ps.status='pending'
			AND ps.vendor_id IS NOT NULL
			AND p.status='succeeded'
		GROUP BY ps.vendor_id`, tenantID)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	created := 0
	var totalAmount, totalCommission float64
	for _, r := range rows {
		if r.Amount <= 0 {
			continue
		}
		if _, err := tx.Exec(`SELECT id FROM payment_splits WHERE tenant_id=$1 AND vendor_id=$2 AND status='pending' FOR UPDATE`, tenantID, r.VendorID); err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		payoutID := uuid.NewString()
		if _, err := tx.Exec(`INSERT INTO vendor_payouts (id, tenant_id, vendor_id, amount, commission_total, currency, status, period_start, period_end)
			VALUES ($1,$2,$3,$4,$5,'UZS','paid_sandbox', CURRENT_DATE - 7, CURRENT_DATE)`,
			payoutID, tenantID, r.VendorID, r.Amount, r.Commission); err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		res, err := tx.Exec(`UPDATE payment_splits SET status='paid_sandbox', payout_id=$1
			WHERE vendor_id=$2 AND tenant_id=$3 AND status='pending'
			  AND payment_id IN (SELECT id FROM payments WHERE status='succeeded')`,
			payoutID, r.VendorID, tenantID)
		if err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			continue
		}
		created++
		totalAmount += r.Amount
		totalCommission += r.Commission
	}
	if err := tx.Commit(); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{
		"payouts_created":  created,
		"status":           "paid_sandbox",
		"total_amount":     totalAmount,
		"total_commission": totalCommission,
		"source":           "payment_splits",
	})
}
