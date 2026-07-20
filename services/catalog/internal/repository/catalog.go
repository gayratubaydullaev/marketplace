package repository

import (
	"database/sql"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/gayrat/marketplace/services/catalog/internal/model"
	"github.com/jmoiron/sqlx"
)

const productColumns = `id, tenant_id, vendor_id, category_id, slug, translations, sku, price, compare_at_price, cost_price, currency, inventory_quantity, inventory_policy, status, is_featured, seo, attributes, images, created_at, updated_at`

type Catalog struct {
	db *sqlx.DB
}

func New(database *sqlx.DB) *Catalog {
	return &Catalog{db: database}
}

func (r *Catalog) Available() bool {
	return r != nil && r.db != nil
}

func (r *Catalog) ListCategories(tenantID string) ([]model.Category, error) {
	var categories []model.Category
	err := r.db.Select(&categories, `SELECT id, tenant_id, parent_id, slug, translations, sort_order, status FROM categories WHERE tenant_id=$1 AND status='active' ORDER BY sort_order`, tenantID)
	return categories, err
}

func (r *Catalog) CreateCategory(id, tenantID string, body model.CreateCategoryRequest) error {
	attrs := body.AttributesSchema
	if len(attrs) == 0 {
		attrs = json.RawMessage(`[]`)
	}
	_, err := r.db.Exec(`INSERT INTO categories (id, tenant_id, parent_id, slug, translations, sort_order, attributes_schema) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, tenantID, body.ParentID, body.Slug, body.Translations, body.SortOrder, attrs)
	return err
}

func (r *Catalog) UpdateCategory(tenantID, id string, body model.UpdateCategoryRequest) error {
	sets := []string{}
	args := []any{}
	add := func(col string, val any) {
		sets = append(sets, col+"=$"+strconv.Itoa(len(args)+1))
		args = append(args, val)
	}
	if body.Translations != nil {
		add("translations", body.Translations)
	}
	if body.AttributesSchema != nil {
		add("attributes_schema", body.AttributesSchema)
	}
	if body.SortOrder != nil {
		add("sort_order", *body.SortOrder)
	}
	if body.Status != nil {
		add("status", *body.Status)
	}
	if body.ParentID != nil {
		add("parent_id", *body.ParentID)
	}
	if len(sets) == 0 {
		return nil
	}
	query := `UPDATE categories SET ` + strings.Join(sets, ",") + ` WHERE id=$` + strconv.Itoa(len(args)+1) + ` AND tenant_id=$` + strconv.Itoa(len(args)+2)
	args = append(args, id, tenantID)
	_, err := r.db.Exec(query, args...)
	return err
}

func (r *Catalog) DeleteCategory(tenantID, id string) error {
	_, err := r.db.Exec(`UPDATE categories SET status='archived' WHERE id=$1 AND tenant_id=$2`, id, tenantID)
	return err
}

type ProductListOpts struct {
	Status   string
	Featured string
	VendorID string
	Sort     string
	MinPrice *float64
	MaxPrice *float64
	Limit    int
	Offset   int
}

func productOrderBy(sort string) string {
	switch sort {
	case "price_asc":
		return ` ORDER BY price ASC, created_at DESC`
	case "price_desc":
		return ` ORDER BY price DESC, created_at DESC`
	case "newest":
		return ` ORDER BY created_at DESC`
	default:
		return ` ORDER BY created_at DESC`
	}
}

func (r *Catalog) ListProducts(tenantID string, opts ProductListOpts) ([]model.Product, int, error) {
	where := ` FROM products WHERE tenant_id=$1`
	args := []any{tenantID}
	status := opts.Status
	if status == "" {
		status = "active"
	}
	if status != "all" {
		where += ` AND status=$` + strconv.Itoa(len(args)+1)
		args = append(args, status)
	}
	if opts.Featured == "true" {
		where += ` AND is_featured=true`
	}
	if opts.VendorID != "" {
		where += ` AND vendor_id=$` + strconv.Itoa(len(args)+1)
		args = append(args, opts.VendorID)
	}
	if opts.MinPrice != nil {
		where += ` AND price>=$` + strconv.Itoa(len(args)+1)
		args = append(args, *opts.MinPrice)
	}
	if opts.MaxPrice != nil {
		where += ` AND price<=$` + strconv.Itoa(len(args)+1)
		args = append(args, *opts.MaxPrice)
	}

	var total int
	if err := r.db.Get(&total, `SELECT COUNT(*)`+where, args...); err != nil {
		return nil, 0, err
	}

	limit := opts.Limit
	offset := opts.Offset
	if limit < 1 {
		limit = 20
	}
	query := `SELECT ` + productColumns + where + productOrderBy(opts.Sort) +
		` LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)
	args = append(args, limit, offset)

	var products []model.Product
	err := r.db.Select(&products, query, args...)
	return products, total, err
}

func (r *Catalog) CategoryIDBySlug(tenantID, slug string) (string, error) {
	var id string
	err := r.db.Get(&id, `SELECT id FROM categories WHERE tenant_id=$1 AND slug=$2`, tenantID, slug)
	return id, err
}

func (r *Catalog) ListProductsByCategory(tenantID, categoryID string, opts ProductListOpts) ([]model.Product, int, error) {
	where := ` FROM products WHERE tenant_id=$1 AND category_id=$2 AND status='active'`
	args := []any{tenantID, categoryID}
	if opts.MinPrice != nil {
		where += ` AND price>=$` + strconv.Itoa(len(args)+1)
		args = append(args, *opts.MinPrice)
	}
	if opts.MaxPrice != nil {
		where += ` AND price<=$` + strconv.Itoa(len(args)+1)
		args = append(args, *opts.MaxPrice)
	}

	var total int
	if err := r.db.Get(&total, `SELECT COUNT(*)`+where, args...); err != nil {
		return nil, 0, err
	}

	limit := opts.Limit
	offset := opts.Offset
	if limit < 1 {
		limit = 50
	}
	query := `SELECT ` + productColumns + where + productOrderBy(opts.Sort) +
		` LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)
	args = append(args, limit, offset)

	var products []model.Product
	err := r.db.Select(&products, query, args...)
	return products, total, err
}

func (r *Catalog) GetProductBySlug(tenantID, slug string) (model.Product, error) {
	var product model.Product
	err := r.db.Get(&product, `SELECT `+productColumns+` FROM products WHERE tenant_id=$1 AND slug=$2`, tenantID, slug)
	return product, err
}

func (r *Catalog) ProductCategoryIDBySlug(tenantID, slug string) (string, error) {
	var categoryID string
	err := r.db.Get(&categoryID, `SELECT category_id FROM products WHERE tenant_id=$1 AND slug=$2`, tenantID, slug)
	return categoryID, err
}

func (r *Catalog) ListRelatedProducts(tenantID, categoryID, slug string) ([]model.Product, error) {
	var products []model.Product
	err := r.db.Select(&products, `SELECT `+productColumns+` FROM products WHERE tenant_id=$1 AND category_id=$2 AND slug<>$3 AND status='active' LIMIT 8`, tenantID, categoryID, slug)
	return products, err
}

func (r *Catalog) CreateProduct(id, tenantID string, body model.CreateProductRequest) error {
	_, err := r.db.Exec(`INSERT INTO products (id, tenant_id, vendor_id, category_id, slug, translations, sku, price, compare_at_price, currency, inventory_quantity, status, is_featured, seo, attributes, images)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		id, tenantID, body.VendorID, body.CategoryID, body.Slug, body.Translations, body.SKU, body.Price, body.CompareAtPrice, body.Currency, body.InventoryQuantity, body.Status, body.IsFeatured, body.SEO, body.Attributes, body.Images)
	return err
}

func (r *Catalog) UpdateProduct(id, tenantID string, body map[string]any) error {
	allowed := []string{"translations", "price", "compare_at_price", "inventory_quantity", "status", "is_featured", "seo", "attributes", "images", "category_id"}
	sets := []string{}
	args := []any{}
	for _, key := range allowed {
		value, ok := body[key]
		if !ok {
			continue
		}
		sets = append(sets, key+"=$"+strconv.Itoa(len(args)+1))
		if object, ok := value.(map[string]any); ok {
			value, _ = json.Marshal(object)
		} else if array, ok := value.([]any); ok {
			value, _ = json.Marshal(array)
		}
		args = append(args, value)
	}
	if len(sets) == 0 {
		return nil
	}
	sets = append(sets, "updated_at=NOW()")
	query := `UPDATE products SET ` + strings.Join(sets, ",") + ` WHERE id=$` + strconv.Itoa(len(args)+1) + ` AND tenant_id=$` + strconv.Itoa(len(args)+2)
	args = append(args, id, tenantID)
	_, err := r.db.Exec(query, args...)
	return err
}

func (r *Catalog) ArchiveProduct(id, tenantID string) error {
	_, err := r.db.Exec(`UPDATE products SET status='archived', updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, id, tenantID)
	return err
}

func (r *Catalog) CreateVariant(id, tenantID, productID string, body model.CreateVariantRequest) error {
	_, err := r.db.Exec(`INSERT INTO product_variants (id, tenant_id, product_id, sku, title, attributes, price, inventory_quantity, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		id, tenantID, productID, body.SKU, body.Title, body.Attributes, body.Price, body.InventoryQuantity, body.ImageURL)
	return err
}

func (r *Catalog) ListVariants(productID string) ([]model.Variant, error) {
	var variants []model.Variant
	err := r.db.Select(&variants, `SELECT id, tenant_id, product_id, sku, title, attributes, price, inventory_quantity, image_url, status FROM product_variants WHERE product_id=$1 ORDER BY created_at ASC`, productID)
	return variants, err
}

func (r *Catalog) CreateBulkProduct(id, tenantID string, product model.BulkProductRequest) error {
	_, err := r.db.Exec(`INSERT INTO products (id, tenant_id, vendor_id, category_id, slug, translations, price, currency, status, seo, attributes, images)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'UZS','draft','{}','{}','[]') ON CONFLICT DO NOTHING`,
		id, tenantID, product.VendorID, product.CategoryID, product.Slug, product.Translations, product.Price)
	return err
}

func (r *Catalog) CreateImportedProduct(id, tenantID string, request model.CreateProductRequest) error {
	_, err := r.db.Exec(`INSERT INTO products (id, tenant_id, category_id, slug, translations, price, currency, inventory_quantity, status, seo, attributes, images)
		VALUES ($1,$2,$3,$4,$5,$6,'UZS',$7,'draft','{}','{}','[]') ON CONFLICT DO NOTHING`,
		id, tenantID, request.CategoryID, request.Slug, request.Translations, request.Price, request.InventoryQuantity)
	return err
}

func (r *Catalog) ExportProducts(tenantID string) (*sqlx.Rows, error) {
	return r.db.Queryx(`SELECT slug, category_id, translations->'uz'->>'name', translations->'ru'->>'name', price, inventory_quantity, status FROM products WHERE tenant_id=$1`, tenantID)
}

func (r *Catalog) AttachImages(id, tenantID string, images json.RawMessage) error {
	_, err := r.db.Exec(`UPDATE products SET images=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, images, id, tenantID)
	return err
}

func (r *Catalog) ListActiveProductSlugs(tenantID string) ([]string, error) {
	var slugs []string
	err := r.db.Select(&slugs, `SELECT slug FROM products WHERE tenant_id=$1 AND status='active'`, tenantID)
	return slugs, err
}

func (r *Catalog) ListActiveCategorySlugs(tenantID string) ([]string, error) {
	var slugs []string
	err := r.db.Select(&slugs, `SELECT slug FROM categories WHERE tenant_id=$1 AND status='active'`, tenantID)
	return slugs, err
}

func (r *Catalog) ModerateProduct(tenantID, id, status, reason string) error {
	_, err := r.db.Exec(`
		UPDATE products
		SET status=$1,
			metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{moderation_reason}', to_jsonb($2::text), true),
			updated_at=NOW()
		WHERE id=$3 AND tenant_id=$4`,
		status, reason, id, tenantID)
	return err
}

func (r *Catalog) ListCoupons(tenantID string) ([]model.Coupon, error) {
	var coupons []model.Coupon
	err := r.db.Select(&coupons, `
		SELECT id, tenant_id, code, type, value, min_order, max_uses, used_count, starts_at, ends_at, status
		FROM coupons WHERE tenant_id=$1 ORDER BY code`, tenantID)
	return coupons, err
}

func (r *Catalog) GetCoupon(tenantID, id string) (model.Coupon, error) {
	var coupon model.Coupon
	err := r.db.Get(&coupon, `
		SELECT id, tenant_id, code, type, value, min_order, max_uses, used_count, starts_at, ends_at, status
		FROM coupons WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return coupon, err
}

func (r *Catalog) CreateCoupon(id, tenantID string, body model.CreateCouponRequest) error {
	status := body.Status
	if status == "" {
		status = "active"
	}
	_, err := r.db.Exec(`
		INSERT INTO coupons (id, tenant_id, code, type, value, min_order, max_uses, starts_at, ends_at, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		id, tenantID, strings.ToUpper(body.Code), body.Type, body.Value, body.MinOrder, body.MaxUses, body.StartsAt, body.EndsAt, status)
	return err
}

func (r *Catalog) UpdateCoupon(tenantID, id string, body model.UpdateCouponRequest) error {
	c, err := r.GetCoupon(tenantID, id)
	if err != nil {
		return err
	}
	if body.Type != nil {
		c.Type = *body.Type
	}
	if body.Value != nil {
		c.Value = *body.Value
	}
	if body.MinOrder != nil {
		c.MinOrder = *body.MinOrder
	}
	if body.MaxUses != nil {
		c.MaxUses = body.MaxUses
	}
	if body.StartsAt != nil {
		c.StartsAt = body.StartsAt
	}
	if body.EndsAt != nil {
		c.EndsAt = body.EndsAt
	}
	if body.Status != nil {
		c.Status = *body.Status
	}
	_, err = r.db.Exec(`
		UPDATE coupons SET type=$1, value=$2, min_order=$3, max_uses=$4, starts_at=$5, ends_at=$6, status=$7
		WHERE id=$8 AND tenant_id=$9`,
		c.Type, c.Value, c.MinOrder, c.MaxUses, c.StartsAt, c.EndsAt, c.Status, id, tenantID)
	return err
}

func (r *Catalog) DeleteCoupon(tenantID, id string) error {
	_, err := r.db.Exec(`DELETE FROM coupons WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return err
}

func (r *Catalog) ListGiftCertificates(tenantID string) ([]model.GiftCertificate, error) {
	var items []model.GiftCertificate
	err := r.db.Select(&items, `
		SELECT id, tenant_id, code, balance, currency, status, expires_at, created_at
		FROM gift_certificates WHERE tenant_id=$1 ORDER BY created_at DESC`, tenantID)
	return items, err
}

func (r *Catalog) GetGiftCertificate(tenantID, id string) (model.GiftCertificate, error) {
	var item model.GiftCertificate
	err := r.db.Get(&item, `
		SELECT id, tenant_id, code, balance, currency, status, expires_at, created_at
		FROM gift_certificates WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return item, err
}

func (r *Catalog) CreateGiftCertificate(id, tenantID string, body model.CreateGiftCertificateRequest) error {
	status := body.Status
	if status == "" {
		status = "active"
	}
	currency := body.Currency
	if currency == "" {
		currency = "UZS"
	}
	_, err := r.db.Exec(`
		INSERT INTO gift_certificates (id, tenant_id, code, balance, currency, status, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, tenantID, strings.ToUpper(body.Code), body.Balance, currency, status, body.ExpiresAt)
	return err
}

func (r *Catalog) UpdateGiftCertificate(tenantID, id string, body model.UpdateGiftCertificateRequest) error {
	item, err := r.GetGiftCertificate(tenantID, id)
	if err != nil {
		return err
	}
	if body.Balance != nil {
		item.Balance = *body.Balance
	}
	if body.Currency != nil {
		item.Currency = *body.Currency
	}
	if body.Status != nil {
		item.Status = *body.Status
	}
	if body.ExpiresAt != nil {
		item.ExpiresAt = body.ExpiresAt
	}
	_, err = r.db.Exec(`
		UPDATE gift_certificates SET balance=$1, currency=$2, status=$3, expires_at=$4
		WHERE id=$5 AND tenant_id=$6`,
		item.Balance, item.Currency, item.Status, item.ExpiresAt, id, tenantID)
	return err
}

func (r *Catalog) DeleteGiftCertificate(tenantID, id string) error {
	_, err := r.db.Exec(`DELETE FROM gift_certificates WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return err
}

const heroBannerColumns = `id, tenant_id, kind, image_url, headline, sub, cta_label, cta_href, cta2_label, cta2_href, sort_order, active, show_brand`

func normalizeBannerKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "promo":
		return "promo"
	default:
		return "hero"
	}
}

func (r *Catalog) ListHeroBanners(tenantID string, activeOnly bool, kind string) ([]model.HeroBanner, error) {
	var items []model.HeroBanner
	q := `SELECT ` + heroBannerColumns + ` FROM hero_banners WHERE tenant_id=$1`
	args := []any{tenantID}
	if kind = strings.TrimSpace(kind); kind != "" && kind != "all" {
		q += ` AND kind=$` + strconv.Itoa(len(args)+1)
		args = append(args, normalizeBannerKind(kind))
	}
	if activeOnly {
		q += ` AND active=TRUE`
	}
	q += ` ORDER BY sort_order ASC, created_at ASC`
	err := r.db.Select(&items, q, args...)
	return items, err
}

func (r *Catalog) GetHeroBanner(tenantID, id string) (model.HeroBanner, error) {
	var item model.HeroBanner
	err := r.db.Get(&item, `SELECT `+heroBannerColumns+` FROM hero_banners WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return item, err
}

func (r *Catalog) CreateHeroBanner(id, tenantID string, body model.CreateHeroBannerRequest) error {
	active := true
	if body.Active != nil {
		active = *body.Active
	}
	showBrand := true
	if body.ShowBrand != nil {
		showBrand = *body.ShowBrand
	}
	kind := normalizeBannerKind(body.Kind)
	_, err := r.db.Exec(`
		INSERT INTO hero_banners (id, tenant_id, kind, image_url, headline, sub, cta_label, cta_href, cta2_label, cta2_href, sort_order, active, show_brand)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		id, tenantID, kind, body.ImageURL, body.Headline, body.Sub, body.CtaLabel, body.CtaHref, body.Cta2Label, body.Cta2Href, body.SortOrder, active, showBrand)
	return err
}

func (r *Catalog) UpdateHeroBanner(tenantID, id string, body model.UpdateHeroBannerRequest) error {
	item, err := r.GetHeroBanner(tenantID, id)
	if err != nil {
		return err
	}
	if body.Kind != nil {
		item.Kind = normalizeBannerKind(*body.Kind)
	}
	if body.ImageURL != nil {
		item.ImageURL = *body.ImageURL
	}
	if body.Headline != nil {
		item.Headline = *body.Headline
	}
	if body.Sub != nil {
		item.Sub = *body.Sub
	}
	if body.CtaLabel != nil {
		item.CtaLabel = *body.CtaLabel
	}
	if body.CtaHref != nil {
		item.CtaHref = *body.CtaHref
	}
	if body.Cta2Label != nil {
		item.Cta2Label = *body.Cta2Label
	}
	if body.Cta2Href != nil {
		item.Cta2Href = *body.Cta2Href
	}
	if body.SortOrder != nil {
		item.SortOrder = *body.SortOrder
	}
	if body.Active != nil {
		item.Active = *body.Active
	}
	if body.ShowBrand != nil {
		item.ShowBrand = *body.ShowBrand
	}
	_, err = r.db.Exec(`
		UPDATE hero_banners SET kind=$1, image_url=$2, headline=$3, sub=$4, cta_label=$5, cta_href=$6, cta2_label=$7, cta2_href=$8,
			sort_order=$9, active=$10, show_brand=$11, updated_at=NOW()
		WHERE id=$12 AND tenant_id=$13`,
		normalizeBannerKind(item.Kind), item.ImageURL, item.Headline, item.Sub, item.CtaLabel, item.CtaHref, item.Cta2Label, item.Cta2Href,
		item.SortOrder, item.Active, item.ShowBrand, id, tenantID)
	return err
}

func (r *Catalog) DeleteHeroBanner(tenantID, id string) error {
	_, err := r.db.Exec(`DELETE FROM hero_banners WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return err
}

func (r *Catalog) GetProductByID(tenantID, id string) (model.Product, error) {
	var product model.Product
	err := r.db.Get(&product, `SELECT `+productColumns+` FROM products WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return product, err
}

func (r *Catalog) AdjustInventory(tenantID, productID string, delta int) (int, error) {
	_, err := r.db.Exec(`UPDATE products SET inventory_quantity = GREATEST(0, inventory_quantity + $1), updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, delta, productID, tenantID)
	if err != nil {
		return 0, err
	}
	p, err := r.GetProductByID(tenantID, productID)
	return p.InventoryQuantity, err
}

func IsNoRows(err error) bool {
	return err == sql.ErrNoRows
}
