package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	commondb "github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/services/catalog/internal/model"
	"github.com/jmoiron/sqlx"
)

const productColumns = `id, tenant_id, vendor_id, category_id, slug, translations, sku, price, compare_at_price, cost_price, currency, inventory_quantity, inventory_policy, status, is_featured, rating, review_count, sales_count, seo, attributes, images, created_at, updated_at`

type Catalog struct {
	db *sqlx.DB
}

func New(database *sqlx.DB) *Catalog {
	return &Catalog{db: database}
}

func (r *Catalog) withTenant(tenantID string, fn func(tx *sqlx.Tx) error) error {
	if r == nil || r.db == nil {
		return fmt.Errorf("database unavailable")
	}
	return commondb.WithTenant(r.db, tenantID, fn)
}


func (r *Catalog) tGet(tenantID string, dest any, query string, args ...any) error {
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(dest, query, args...)
	})
}

func (r *Catalog) tSelect(tenantID string, dest any, query string, args ...any) error {
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(dest, query, args...)
	})
}

func (r *Catalog) tExec(tenantID string, query string, args ...any) error {
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(query, args...)
		return err
	})
}

func (r *Catalog) Available() bool {
	return r != nil && r.db != nil
}

func (r *Catalog) ResolveVendorID(tenantID, userID string) (string, error) {
	var vendorID string
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&vendorID, `
			SELECT id::text FROM vendors
			WHERE user_id=$1 AND tenant_id=$2
			ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, created_at DESC
			LIMIT 1`, userID, tenantID)
	})
	return vendorID, err
}

func (r *Catalog) ListCategories(tenantID string) ([]model.Category, error) {
	var categories []model.Category
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&categories, `SELECT id, tenant_id, parent_id, slug, translations, image_url, sort_order, status FROM categories WHERE tenant_id=$1 AND status='active' ORDER BY sort_order`, tenantID)
	})
	return categories, err
}

func (r *Catalog) CreateCategory(id, tenantID string, body model.CreateCategoryRequest) error {
	attrs := body.AttributesSchema
	if len(attrs) == 0 {
		attrs = json.RawMessage(`[]`)
	}
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(`INSERT INTO categories (id, tenant_id, parent_id, slug, translations, sort_order, attributes_schema, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			id, tenantID, body.ParentID, body.Slug, body.Translations, body.SortOrder, attrs, body.ImageURL)
		return err
	})
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
	if body.ImageURL != nil {
		url := strings.TrimSpace(*body.ImageURL)
		if url == "" {
			add("image_url", nil)
		} else {
			add("image_url", url)
		}
	}
	if len(sets) == 0 {
		return nil
	}
	query := `UPDATE categories SET ` + strings.Join(sets, ",") + ` WHERE id=$` + strconv.Itoa(len(args)+1) + ` AND tenant_id=$` + strconv.Itoa(len(args)+2)
	args = append(args, id, tenantID)
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(query, args...)
		return err
	})
}

func (r *Catalog) DeleteCategory(tenantID, id string) error {
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(`UPDATE categories SET status='archived' WHERE id=$1 AND tenant_id=$2`, id, tenantID)
		return err
	})
}

type ProductListOpts struct {
	Status   string
	Featured string
	OnSale   string
	InStock  string
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
	case "rating":
		return ` ORDER BY rating DESC, review_count DESC, created_at DESC`
	case "popular":
		return ` ORDER BY sales_count DESC, created_at DESC`
	default:
		return ` ORDER BY created_at DESC`
	}
}

func productOrderByPrefixed(sort, alias string) string {
	p := alias + "."
	switch sort {
	case "price_asc":
		return ` ORDER BY ` + p + `price ASC, ` + p + `created_at DESC`
	case "price_desc":
		return ` ORDER BY ` + p + `price DESC, ` + p + `created_at DESC`
	case "newest":
		return ` ORDER BY ` + p + `created_at DESC`
	case "rating":
		return ` ORDER BY ` + p + `rating DESC, ` + p + `review_count DESC, ` + p + `created_at DESC`
	case "popular":
		return ` ORDER BY ` + p + `sales_count DESC, ` + p + `created_at DESC`
	default:
		return ` ORDER BY ` + p + `created_at DESC`
	}
}

func (r *Catalog) ListProducts(tenantID string, opts ProductListOpts) ([]model.Product, int, error) {
	if opts.Sort == "home" {
		return r.ListHomeFeed(tenantID, opts.Limit, opts.Offset)
	}

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
	if opts.OnSale == "true" {
		where += ` AND compare_at_price IS NOT NULL AND compare_at_price > price`
	}
	if opts.InStock == "true" {
		where += ` AND inventory_quantity > 0`
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

	limit := opts.Limit
	offset := opts.Offset
	if limit < 1 {
		limit = 20
	}
	query := `SELECT ` + productColumns + where + productOrderBy(opts.Sort) +
		` LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)
	listArgs := append(append([]any{}, args...), limit, offset)

	var products []model.Product
	var total int
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		if err := tx.Get(&total, `SELECT COUNT(*)`+where, args...); err != nil {
			return err
		}
		return tx.Select(&products, query, listArgs...)
	})
	return products, total, err
}

// ListHomeFeed builds a mixed feed: top-rated, popular (sales), and newest —
// round-robin merged with category diversity for the homepage.
func (r *Catalog) ListHomeFeed(tenantID string, limit, offset int) ([]model.Product, int, error) {
	if limit < 1 {
		limit = 24
	}
	if offset < 0 {
		offset = 0
	}
	need := offset + limit
	poolSize := need * 2
	if poolSize < 200 {
		poolSize = 200
	}
	if poolSize > 400 {
		poolSize = 400
	}

	var total int
	var rated, popular, newest []model.Product
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		if err := tx.Get(&total, `SELECT COUNT(*) FROM products WHERE tenant_id=$1 AND status='active'`, tenantID); err != nil {
			return err
		}
		fetch := func(orderSQL string) ([]model.Product, error) {
			var items []model.Product
			q := `SELECT ` + productColumns + ` FROM products WHERE tenant_id=$1 AND status='active'` + orderSQL + ` LIMIT $2`
			err := tx.Select(&items, q, tenantID, poolSize)
			return items, err
		}
		var err error
		rated, err = fetch(` ORDER BY rating DESC, review_count DESC, created_at DESC`)
		if err != nil {
			return err
		}
		popular, err = fetch(` ORDER BY sales_count DESC, created_at DESC`)
		if err != nil {
			return err
		}
		newest, err = fetch(` ORDER BY created_at DESC`)
		return err
	})
	if err != nil {
		return nil, 0, err
	}

	mixed := mixHomePools(rated, popular, newest)
	diversified := diversifyByCategory(mixed, 8, 2)

	// If diversity+dedupe left us short of the requested window, top up from newest.
	if len(diversified) < need {
		seen := make(map[string]struct{}, len(diversified))
		for _, p := range diversified {
			seen[p.ID] = struct{}{}
		}
		for _, p := range newest {
			if _, ok := seen[p.ID]; ok {
				continue
			}
			diversified = append(diversified, p)
			seen[p.ID] = struct{}{}
			if len(diversified) >= need {
				break
			}
		}
	}

	if offset >= len(diversified) {
		return []model.Product{}, total, nil
	}
	end := offset + limit
	if end > len(diversified) {
		end = len(diversified)
	}
	return diversified[offset:end], total, nil
}

func mixHomePools(pools ...[]model.Product) []model.Product {
	seen := make(map[string]struct{})
	out := make([]model.Product, 0)
	maxLen := 0
	for _, p := range pools {
		if len(p) > maxLen {
			maxLen = len(p)
		}
	}
	for i := 0; i < maxLen; i++ {
		for _, pool := range pools {
			if i >= len(pool) {
				continue
			}
			p := pool[i]
			if _, ok := seen[p.ID]; ok {
				continue
			}
			seen[p.ID] = struct{}{}
			out = append(out, p)
		}
	}
	return out
}

// diversifyByCategory limits how often the same category appears in a sliding window.
func diversifyByCategory(items []model.Product, window, maxPerCat int) []model.Product {
	if window < 1 || maxPerCat < 1 || len(items) == 0 {
		return items
	}
	out := make([]model.Product, 0, len(items))
	deferred := make([]model.Product, 0)
	catInWindow := func(cat string) int {
		start := len(out) - window
		if start < 0 {
			start = 0
		}
		n := 0
		for _, p := range out[start:] {
			if p.CategoryID == cat {
				n++
			}
		}
		return n
	}

	tryPlace := func(p model.Product) bool {
		if catInWindow(p.CategoryID) >= maxPerCat {
			return false
		}
		out = append(out, p)
		return true
	}

	for _, p := range items {
		if !tryPlace(p) {
			deferred = append(deferred, p)
		}
	}
	// Drain deferred with relaxed retries.
	progress := true
	for progress && len(deferred) > 0 {
		progress = false
		next := deferred[:0]
		for _, p := range deferred {
			if tryPlace(p) {
				progress = true
			} else {
				next = append(next, p)
			}
		}
		deferred = next
	}
	out = append(out, deferred...)
	return out
}

func (r *Catalog) CategoryIDBySlug(tenantID, slug string) (string, error) {
	var id string
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&id, `SELECT id FROM categories WHERE tenant_id=$1 AND slug=$2`, tenantID, slug)
	})
	return id, err
}

func (r *Catalog) ListProductsByCategory(tenantID, categoryID string, opts ProductListOpts) ([]model.Product, int, error) {
	// Include products in this category and all descendant subcategories.
	where := ` FROM products p
		WHERE p.tenant_id=$1 AND p.status='active'
		AND p.category_id IN (
			WITH RECURSIVE cat_tree AS (
				SELECT id FROM categories WHERE tenant_id=$1 AND id=$2
				UNION ALL
				SELECT c.id FROM categories c
				INNER JOIN cat_tree t ON c.parent_id = t.id
				WHERE c.tenant_id=$1 AND c.status='active'
			)
			SELECT id FROM cat_tree
		)`
	args := []any{tenantID, categoryID}
	if opts.Featured == "true" {
		where += ` AND p.is_featured=true`
	}
	if opts.OnSale == "true" {
		where += ` AND p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price`
	}
	if opts.InStock == "true" {
		where += ` AND p.inventory_quantity > 0`
	}
	if opts.MinPrice != nil {
		where += ` AND p.price>=$` + strconv.Itoa(len(args)+1)
		args = append(args, *opts.MinPrice)
	}
	if opts.MaxPrice != nil {
		where += ` AND p.price<=$` + strconv.Itoa(len(args)+1)
		args = append(args, *opts.MaxPrice)
	}

	var total int
	if err := r.tGet(tenantID, &total, `SELECT COUNT(*)`+where, args...); err != nil {
		return nil, 0, err
	}

	limit := opts.Limit
	offset := opts.Offset
	if limit < 1 {
		limit = 50
	}
	// productColumns are unqualified; prefix with p. for the JOIN-less FROM products p alias.
	cols := strings.ReplaceAll(productColumns, ", ", ", p.")
	cols = "p." + cols
	query := `SELECT ` + cols + where + productOrderByPrefixed(opts.Sort, "p") +
		` LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)
	args = append(args, limit, offset)

	var products []model.Product
	err := r.tSelect(tenantID, &products, query, args...)
	return products, total, err
}

func (r *Catalog) GetProductBySlug(tenantID, slug string) (model.Product, error) {
	var product model.Product
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&product, `SELECT `+productColumns+` FROM products WHERE tenant_id=$1 AND slug=$2`, tenantID, slug)
	})
	return product, err
}

func (r *Catalog) ProductCategoryIDBySlug(tenantID, slug string) (string, error) {
	var categoryID string
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&categoryID, `SELECT category_id FROM products WHERE tenant_id=$1 AND slug=$2`, tenantID, slug)
	})
	return categoryID, err
}

func (r *Catalog) ListRelatedProducts(tenantID, categoryID, slug string) ([]model.Product, error) {
	var products []model.Product
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Select(&products, `SELECT `+productColumns+` FROM products WHERE tenant_id=$1 AND category_id=$2 AND slug<>$3 AND status='active' LIMIT 8`, tenantID, categoryID, slug)
	})
	return products, err
}

func (r *Catalog) CreateProduct(id, tenantID string, body model.CreateProductRequest) error {
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(`INSERT INTO products (id, tenant_id, vendor_id, category_id, slug, translations, sku, price, compare_at_price, currency, inventory_quantity, status, is_featured, seo, attributes, images)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
			id, tenantID, body.VendorID, body.CategoryID, body.Slug, body.Translations, body.SKU, body.Price, body.CompareAtPrice, body.Currency, body.InventoryQuantity, body.Status, body.IsFeatured, body.SEO, body.Attributes, body.Images)
		return err
	})
}

func (r *Catalog) UpdateProduct(id, tenantID string, body map[string]any) error {
	allowed := []string{"translations", "price", "compare_at_price", "inventory_quantity", "inventory_policy", "status", "is_featured", "seo", "attributes", "images", "category_id"}
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
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(query, args...)
		return err
	})
}

func (r *Catalog) BulkEditProducts(tenantID string, body model.BulkEditRequest) (int, error) {
	sets := make([]string, 0, 3)
	args := make([]any, 0, 5)
	if body.Price != nil {
		sets = append(sets, "price=$"+strconv.Itoa(len(args)+1))
		args = append(args, *body.Price)
	}
	if body.Status != nil {
		sets = append(sets, "status=$"+strconv.Itoa(len(args)+1))
		args = append(args, *body.Status)
	}
	if body.CategoryID != nil {
		sets = append(sets, "category_id=$"+strconv.Itoa(len(args)+1))
		args = append(args, *body.CategoryID)
	}
	if len(sets) == 0 {
		return 0, nil
	}
	sets = append(sets, "updated_at=NOW()")
	args = append(args, tenantID, body.IDs)
	query := `UPDATE products SET ` + strings.Join(sets, ",") +
		` WHERE tenant_id=$` + strconv.Itoa(len(args)-1) + ` AND id = ANY($` + strconv.Itoa(len(args)) + `::uuid[])`
	var result sql.Result
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var e error
		result, e = tx.Exec(query, args...)
		return e
	})
	if err != nil {
		return 0, err
	}
	updated, err := result.RowsAffected()
	return int(updated), err
}

func (r *Catalog) ProductStatuses(tenantID string, ids []string) (map[string]string, error) {
	statuses := make(map[string]string, len(ids))
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		rows, err := tx.Queryx(
			`SELECT id::text, status FROM products WHERE tenant_id=$1 AND id = ANY($2::uuid[])`,
			tenantID, ids,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id, status string
			if err := rows.Scan(&id, &status); err != nil {
				return err
			}
			statuses[id] = status
		}
		return rows.Err()
	})
	return statuses, err
}

func (r *Catalog) ArchiveProduct(id, tenantID string) error {
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(`UPDATE products SET status='archived', updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, id, tenantID)
		return err
	})
}

func (r *Catalog) CreateVariant(id, tenantID, productID string, body model.CreateVariantRequest) error {
	err := r.tExec(tenantID, `INSERT INTO product_variants (id, tenant_id, product_id, sku, title, attributes, price, inventory_quantity, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		id, tenantID, productID, body.SKU, body.Title, body.Attributes, body.Price, body.InventoryQuantity, body.ImageURL)
	return err
}

func (r *Catalog) ListVariants(productID string) ([]model.Variant, error) {
	var variants []model.Variant
	err := commondb.WithRLSBypass(r.db, func(tx *sqlx.Tx) error {
		return tx.Select(&variants, `SELECT id, tenant_id, product_id, sku, title, attributes, price, inventory_quantity, image_url, status FROM product_variants WHERE product_id=$1 ORDER BY created_at ASC`, productID)
	})
	return variants, err
}

func (r *Catalog) UpdateVariant(tenantID, productID, variantID string, body model.UpdateVariantRequest) error {
	return r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		var exists string
		if err := tx.Get(&exists, `SELECT id::text FROM product_variants WHERE id=$1 AND product_id=$2 AND tenant_id=$3`, variantID, productID, tenantID); err != nil {
			return err
		}
		if body.Title != nil {
			if _, err := tx.Exec(`UPDATE product_variants SET title=$1 WHERE id=$2`, *body.Title, variantID); err != nil {
				return err
			}
		}
		if body.Price != nil {
			if _, err := tx.Exec(`UPDATE product_variants SET price=$1 WHERE id=$2`, *body.Price, variantID); err != nil {
				return err
			}
		}
		if body.InventoryQuantity != nil {
			if _, err := tx.Exec(`UPDATE product_variants SET inventory_quantity=$1 WHERE id=$2`, *body.InventoryQuantity, variantID); err != nil {
				return err
			}
			// Keep product aggregate inventory in sync with sum of variants when possible.
			_, _ = tx.Exec(`
				UPDATE products SET inventory_quantity = COALESCE((
					SELECT SUM(inventory_quantity) FROM product_variants WHERE product_id=$1
				), inventory_quantity), updated_at=NOW()
				WHERE id=$1 AND tenant_id=$2`, productID, tenantID)
		}
		if body.ImageURL != nil {
			if _, err := tx.Exec(`UPDATE product_variants SET image_url=$1 WHERE id=$2`, *body.ImageURL, variantID); err != nil {
				return err
			}
		}
		if body.Status != nil {
			if _, err := tx.Exec(`UPDATE product_variants SET status=$1 WHERE id=$2`, *body.Status, variantID); err != nil {
				return err
			}
		}
		if body.SKU != nil {
			if _, err := tx.Exec(`UPDATE product_variants SET sku=$1 WHERE id=$2`, *body.SKU, variantID); err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Catalog) CreateBulkProduct(id, tenantID string, product model.BulkProductRequest) error {
	err := r.tExec(tenantID, `INSERT INTO products (id, tenant_id, vendor_id, category_id, slug, translations, price, currency, status, seo, attributes, images)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'UZS','draft','{}','{}','[]') ON CONFLICT DO NOTHING`,
		id, tenantID, product.VendorID, product.CategoryID, product.Slug, product.Translations, product.Price)
	return err
}

func (r *Catalog) CreateImportedProduct(id, tenantID string, request model.CreateProductRequest) error {
	err := r.tExec(tenantID, `INSERT INTO products (id, tenant_id, vendor_id, category_id, slug, translations, price, currency, inventory_quantity, status, seo, attributes, images)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'UZS',$8,'draft','{}','{}','[]') ON CONFLICT DO NOTHING`,
		id, tenantID, request.VendorID, request.CategoryID, request.Slug, request.Translations, request.Price, request.InventoryQuantity)
	return err
}

func (r *Catalog) ExportProducts(tenantID string) (*sqlx.Rows, error) {
	// Rows must outlive the call: pin tenant GUC on a dedicated conn then Queryx.
	// Prefer migrate callers to stream via Select; this path is admin-only CSV export.
	if err := commondb.SetTenant(r.db, tenantID); err != nil {
		return nil, err
	}
	return r.db.Queryx(`SELECT slug, category_id, translations->'uz'->>'name', translations->'ru'->>'name', price, inventory_quantity, status FROM products WHERE tenant_id=$1`, tenantID)
}

func (r *Catalog) AttachImages(id, tenantID string, images json.RawMessage) error {
	err := r.tExec(tenantID, `UPDATE products SET images=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, images, id, tenantID)
	return err
}

func (r *Catalog) ListActiveProductSlugs(tenantID string) ([]string, error) {
	var slugs []string
	err := r.tSelect(tenantID, &slugs, `SELECT slug FROM products WHERE tenant_id=$1 AND status='active'`, tenantID)
	return slugs, err
}

func (r *Catalog) ListActiveCategorySlugs(tenantID string) ([]string, error) {
	var slugs []string
	err := r.tSelect(tenantID, &slugs, `SELECT slug FROM categories WHERE tenant_id=$1 AND status='active'`, tenantID)
	return slugs, err
}

func (r *Catalog) ModerateProduct(tenantID, id, status, reason string) error {
	return r.tExec(tenantID, `
		UPDATE products
		SET status=$1,
			metadata=jsonb_set(COALESCE(metadata, '{}'::jsonb), '{moderation_reason}', to_jsonb($2::text), true),
			updated_at=NOW()
		WHERE id=$3 AND tenant_id=$4`,
		status, reason, id, tenantID)
}

func (r *Catalog) ListCoupons(tenantID string) ([]model.Coupon, error) {
	var coupons []model.Coupon
	err := r.tSelect(tenantID, &coupons, `
		SELECT id, tenant_id, code, type, value, min_order, max_uses, used_count, starts_at, ends_at, status
		FROM coupons WHERE tenant_id=$1 ORDER BY code`, tenantID)
	return coupons, err
}

func (r *Catalog) GetCoupon(tenantID, id string) (model.Coupon, error) {
	var coupon model.Coupon
	err := r.tGet(tenantID, &coupon, `
		SELECT id, tenant_id, code, type, value, min_order, max_uses, used_count, starts_at, ends_at, status
		FROM coupons WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return coupon, err
}

func (r *Catalog) CreateCoupon(id, tenantID string, body model.CreateCouponRequest) error {
	status := body.Status
	if status == "" {
		status = "active"
	}
	return r.tExec(tenantID, `
		INSERT INTO coupons (id, tenant_id, code, type, value, min_order, max_uses, starts_at, ends_at, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		id, tenantID, strings.ToUpper(body.Code), body.Type, body.Value, body.MinOrder, body.MaxUses, body.StartsAt, body.EndsAt, status)
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
	return r.tExec(tenantID, `
		UPDATE coupons SET type=$1, value=$2, min_order=$3, max_uses=$4, starts_at=$5, ends_at=$6, status=$7
		WHERE id=$8 AND tenant_id=$9`,
		c.Type, c.Value, c.MinOrder, c.MaxUses, c.StartsAt, c.EndsAt, c.Status, id, tenantID)
}

func (r *Catalog) DeleteCoupon(tenantID, id string) error {
	err := r.tExec(tenantID, `DELETE FROM coupons WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return err
}

func (r *Catalog) ListGiftCertificates(tenantID string) ([]model.GiftCertificate, error) {
	var items []model.GiftCertificate
	err := r.tSelect(tenantID, &items, `
		SELECT id, tenant_id, code, balance, currency, status, expires_at, created_at
		FROM gift_certificates WHERE tenant_id=$1 ORDER BY created_at DESC`, tenantID)
	return items, err
}

func (r *Catalog) GetGiftCertificate(tenantID, id string) (model.GiftCertificate, error) {
	var item model.GiftCertificate
	err := r.tGet(tenantID, &item, `
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
	return r.tExec(tenantID, `
		INSERT INTO gift_certificates (id, tenant_id, code, balance, currency, status, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, tenantID, strings.ToUpper(body.Code), body.Balance, currency, status, body.ExpiresAt)
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
	return r.tExec(tenantID, `
		UPDATE gift_certificates SET balance=$1, currency=$2, status=$3, expires_at=$4
		WHERE id=$5 AND tenant_id=$6`,
		item.Balance, item.Currency, item.Status, item.ExpiresAt, id, tenantID)
}

func (r *Catalog) DeleteGiftCertificate(tenantID, id string) error {
	err := r.tExec(tenantID, `DELETE FROM gift_certificates WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return err
}

const heroBannerColumns = `id, tenant_id, kind, image_url, headline, sub, cta_label, cta_href, cta2_label, cta2_href, sort_order, active, show_brand, interval_sec, starts_at, ends_at`

func normalizeBannerKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "promo":
		return "promo"
	default:
		return "hero"
	}
}

func clampIntervalSec(v int) int {
	if v < 2 {
		return 2
	}
	if v > 120 {
		return 120
	}
	return v
}

func parseOptionalTime(raw *string) (*time.Time, error) {
	if raw == nil {
		return nil, nil
	}
	s := strings.TrimSpace(*raw)
	if s == "" || s == "null" {
		return nil, nil
	}
	layouts := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return &t, nil
		}
	}
	return nil, fmt.Errorf("invalid datetime: %s", s)
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
		q += ` AND (starts_at IS NULL OR starts_at <= NOW())`
		q += ` AND (ends_at IS NULL OR ends_at >= NOW())`
	}
	q += ` ORDER BY sort_order ASC, created_at ASC`
	err := r.tSelect(tenantID, &items, q, args...)
	return items, err
}

func (r *Catalog) GetHeroBanner(tenantID, id string) (model.HeroBanner, error) {
	var item model.HeroBanner
	err := r.tGet(tenantID, &item, `SELECT `+heroBannerColumns+` FROM hero_banners WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return item, err
}

func (r *Catalog) CreateHeroBanner(id, tenantID string, body model.CreateHeroBannerRequest) error {
	active := true
	if body.Active != nil {
		active = *body.Active
	}
	showBrand := false
	if body.ShowBrand != nil {
		showBrand = *body.ShowBrand
	}
	interval := 6
	if body.IntervalSec != nil {
		interval = clampIntervalSec(*body.IntervalSec)
	}
	startsAt, err := parseOptionalTime(body.StartsAt)
	if err != nil {
		return err
	}
	endsAt, err := parseOptionalTime(body.EndsAt)
	if err != nil {
		return err
	}
	kind := normalizeBannerKind(body.Kind)
	return r.tExec(tenantID, `
		INSERT INTO hero_banners (id, tenant_id, kind, image_url, headline, sub, cta_label, cta_href, cta2_label, cta2_href, sort_order, active, show_brand, interval_sec, starts_at, ends_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		id, tenantID, kind, body.ImageURL, body.Headline, body.Sub, body.CtaLabel, body.CtaHref, body.Cta2Label, body.Cta2Href, body.SortOrder, active, showBrand, interval, startsAt, endsAt)
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
	if body.IntervalSec != nil {
		item.IntervalSec = clampIntervalSec(*body.IntervalSec)
	}
	if body.StartsAt != nil {
		startsAt, err := parseOptionalTime(body.StartsAt)
		if err != nil {
			return err
		}
		item.StartsAt = startsAt
	}
	if body.EndsAt != nil {
		endsAt, err := parseOptionalTime(body.EndsAt)
		if err != nil {
			return err
		}
		item.EndsAt = endsAt
	}
	if item.IntervalSec <= 0 {
		item.IntervalSec = 6
	}
	return r.tExec(tenantID, `
		UPDATE hero_banners SET kind=$1, image_url=$2, headline=$3, sub=$4, cta_label=$5, cta_href=$6, cta2_label=$7, cta2_href=$8,
			sort_order=$9, active=$10, show_brand=$11, interval_sec=$12, starts_at=$13, ends_at=$14, updated_at=NOW()
		WHERE id=$15 AND tenant_id=$16`,
		normalizeBannerKind(item.Kind), item.ImageURL, item.Headline, item.Sub, item.CtaLabel, item.CtaHref, item.Cta2Label, item.Cta2Href,
		item.SortOrder, item.Active, item.ShowBrand, clampIntervalSec(item.IntervalSec), item.StartsAt, item.EndsAt, id, tenantID)
}

func (r *Catalog) DeleteHeroBanner(tenantID, id string) error {
	err := r.tExec(tenantID, `DELETE FROM hero_banners WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	return err
}

func (r *Catalog) GetProductByID(tenantID, id string) (model.Product, error) {
	var product model.Product
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		return tx.Get(&product, `SELECT `+productColumns+` FROM products WHERE tenant_id=$1 AND id=$2`, tenantID, id)
	})
	return product, err
}

func (r *Catalog) AdjustInventory(tenantID, productID string, delta int) (int, error) {
	var qty int
	err := r.withTenant(tenantID, func(tx *sqlx.Tx) error {
		if _, err := tx.Exec(`UPDATE products SET inventory_quantity = GREATEST(0, inventory_quantity + $1), updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, delta, productID, tenantID); err != nil {
			return err
		}
		return tx.Get(&qty, `SELECT inventory_quantity FROM products WHERE tenant_id=$1 AND id=$2`, tenantID, productID)
	})
	return qty, err
}

func IsNoRows(err error) bool {
	return err == sql.ErrNoRows
}
