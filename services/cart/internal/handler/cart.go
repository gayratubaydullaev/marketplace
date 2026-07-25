package handler

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/gayrat/marketplace/packages/go-common/commerce"
	commondb "github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/cart/internal/model"
	"github.com/gayrat/marketplace/services/cart/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type CartHandler struct{ Service *service.CartService }
type Cart = model.Cart
type CartItem = model.CartItem
type Address = model.Address

// querier is satisfied by *sqlx.DB and *sqlx.Tx.
type querier interface {
	Get(dest interface{}, query string, args ...interface{}) error
	Select(dest interface{}, query string, args ...interface{}) error
	Exec(query string, args ...interface{}) (sql.Result, error)
	QueryRow(query string, args ...interface{}) *sql.Row
}

func (h *CartHandler) GetCart(c *gin.Context)          { getCart(c, h.Service.Repo.DB) }
func (h *CartHandler) AddItem(c *gin.Context)          { addItem(c, h.Service.Repo.DB) }
func (h *CartHandler) UpdateItem(c *gin.Context)       { updateItem(c, h.Service.Repo.DB) }
func (h *CartHandler) RemoveItem(c *gin.Context)       { removeItem(c, h.Service.Repo.DB) }
func (h *CartHandler) SyncCart(c *gin.Context)         { syncCart(c, h.Service.Repo.DB) }
func (h *CartHandler) ApplyCoupon(c *gin.Context)      { applyCoupon(c, h.Service.Repo.DB) }
func (h *CartHandler) RemoveCoupon(c *gin.Context)     { removeCoupon(c, h.Service.Repo.DB) }
func (h *CartHandler) ApplyGift(c *gin.Context)        { applyGift(c, h.Service.Repo.DB) }
func (h *CartHandler) RemoveGift(c *gin.Context)       { removeGift(c, h.Service.Repo.DB) }
func (h *CartHandler) ShippingEstimate(c *gin.Context) { shippingEstimate(c) }
func (h *CartHandler) CheckoutPreview(c *gin.Context)  { checkoutPreview(c, h.Service.Repo.DB) }
func (h *CartHandler) MergeGuest(c *gin.Context)       { mergeGuest(c, h.Service.Repo.DB) }
func (h *CartHandler) ListAddresses(c *gin.Context)    { listAddresses(c, h.Service.Repo.DB) }
func (h *CartHandler) CreateAddress(c *gin.Context)    { createAddress(c, h.Service.Repo.DB) }
func (h *CartHandler) UpdateAddress(c *gin.Context)    { updateAddress(c, h.Service.Repo.DB) }
func (h *CartHandler) DeleteAddress(c *gin.Context)    { deleteAddress(c, h.Service.Repo.DB) }

// withTenant runs fn inside a transaction with app.current_tenant set (pool-safe for strict RLS).
func withTenant(c *gin.Context, database *sqlx.DB, fn func(tx *sqlx.Tx) error) error {
	return commondb.WithTenant(database, middleware.GetTenantID(c), fn)
}

func resolveCart(c *gin.Context, q querier) (*Cart, error) {
	tenantID := middleware.GetTenantID(c)
	claims := middleware.GetClaims(c)
	guestID := c.GetHeader("X-Guest-ID")
	var cart Cart
	var err error
	if claims != nil {
		err = q.Get(&cart, `SELECT id, tenant_id, user_id, guest_id, coupon_code, gift_certificate_code, currency FROM carts WHERE tenant_id=$1 AND user_id=$2 ORDER BY updated_at DESC LIMIT 1`, tenantID, claims.UserID)
		if err == sql.ErrNoRows {
			id, uid := uuid.NewString(), claims.UserID
			_, err = q.Exec(`INSERT INTO carts (id, tenant_id, user_id, currency) VALUES ($1,$2,$3,'UZS')`, id, tenantID, uid)
			if err != nil {
				return nil, err
			}
			return &Cart{ID: id, TenantID: tenantID, UserID: &uid, Currency: "UZS"}, nil
		}
		return &cart, err
	}
	if guestID == "" {
		guestID = uuid.NewString()
		c.Header("X-Guest-ID", guestID)
	}
	err = q.Get(&cart, `SELECT id, tenant_id, user_id, guest_id, coupon_code, gift_certificate_code, currency FROM carts WHERE tenant_id=$1 AND guest_id=$2 ORDER BY updated_at DESC LIMIT 1`, tenantID, guestID)
	if err == sql.ErrNoRows {
		id := uuid.NewString()
		_, err = q.Exec(`INSERT INTO carts (id, tenant_id, guest_id, currency) VALUES ($1,$2,$3,'UZS')`, id, tenantID, guestID)
		if err != nil {
			return nil, err
		}
		return &Cart{ID: id, TenantID: tenantID, GuestID: &guestID, Currency: "UZS"}, nil
	}
	return &cart, err
}

func lookupProductPrice(q querier, tenantID, productID string, variantID *string) (price float64, title string, vendorID *string, err error) {
	if variantID != nil && *variantID != "" {
		err = q.QueryRow(`SELECT v.price, COALESCE(v.title, p.translations->'uz'->>'name'), p.vendor_id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 AND v.tenant_id=$2 AND p.status='active'`, *variantID, tenantID).Scan(&price, &title, &vendorID)
		if err == nil {
			return
		}
	}
	err = q.QueryRow(`SELECT price, COALESCE(translations->'uz'->>'name', slug), vendor_id FROM products WHERE id=$1 AND tenant_id=$2 AND status IN ('active','out_of_stock')`, productID, tenantID).Scan(&price, &title, &vendorID)
	return
}

func calcTotals(q querier, cart *Cart, items []CartItem) (subtotal, discount, gift, total float64) {
	for _, it := range items {
		subtotal += float64(it.Quantity) * it.UnitPrice
	}
	if cart.CouponCode != nil {
		var spec commerce.CouponSpec
		err := q.QueryRow(`SELECT type, value, min_order, max_uses, used_count, starts_at, ends_at, status FROM coupons WHERE tenant_id=$1 AND code=$2`, cart.TenantID, *cart.CouponCode).Scan(
			&spec.Type, &spec.Value, &spec.MinOrder, &spec.MaxUses, &spec.UsedCount, &spec.StartsAt, &spec.EndsAt, &spec.Status,
		)
		if err == nil {
			discount = commerce.CouponDiscount(subtotal, spec)
		}
	}
	remaining := subtotal - discount
	if cart.GiftCertificateCode != nil {
		var bal float64
		var status string
		err := q.QueryRow(`SELECT balance, status FROM gift_certificates WHERE tenant_id=$1 AND code=$2`, cart.TenantID, *cart.GiftCertificateCode).Scan(&bal, &status)
		if err == nil {
			gift = commerce.GiftApply(remaining, bal, status)
		}
	}
	total = remaining - gift
	if total < 0 {
		total = 0
	}
	return
}

func getCart(c *gin.Context, database *sqlx.DB) {
	if database == nil {
		httpx.Internal(c, "db unavailable")
		return
	}
	var (
		cart                                    *Cart
		items                                   []CartItem
		groups                                  map[string][]CartItem
		subtotal, discount, giftAmt, total float64
	)
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		var err error
		cart, err = resolveCart(c, tx)
		if err != nil {
			return err
		}
		items = []CartItem{}
		_ = tx.Select(&items, `SELECT id, cart_id, product_id, variant_id, vendor_id, quantity, unit_price, title FROM cart_items WHERE cart_id=$1`, cart.ID)
		if items == nil {
			items = []CartItem{}
		}
		groups = map[string][]CartItem{}
		for _, it := range items {
			key := "platform"
			if it.VendorID != nil {
				key = *it.VendorID
			}
			groups[key] = append(groups[key], it)
		}
		subtotal, discount, giftAmt, total = calcTotals(tx, cart, items)
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"cart": cart, "items": items, "groups": groups, "subtotal": subtotal, "discount": discount, "gift": giftAmt, "total": total, "currency": "UZS"})
}

type syncInactiveProductError struct{ ProductID string }

func (e syncInactiveProductError) Error() string {
	return "product not found or inactive: " + e.ProductID
}

// syncCart replaces server cart lines with the exact client payload (checkout-safe).
func syncCart(c *gin.Context, database *sqlx.DB) {
	if database == nil {
		httpx.Internal(c, "db unavailable")
		return
	}
	var body struct {
		Items []struct {
			ProductID string  `json:"product_id" binding:"required"`
			VariantID *string `json:"variant_id"`
			Quantity  int     `json:"quantity"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	tenantID := middleware.GetTenantID(c)
	var (
		cart  *Cart
		items []CartItem
	)
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		var err error
		cart, err = resolveCart(c, tx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM cart_items WHERE cart_id=$1`, cart.ID); err != nil {
			return err
		}
		for _, item := range body.Items {
			qty := item.Quantity
			if qty < 1 {
				continue
			}
			price, title, vendorID, err := lookupProductPrice(tx, tenantID, item.ProductID, item.VariantID)
			if err != nil {
				return syncInactiveProductError{ProductID: item.ProductID}
			}
			var variant any
			if item.VariantID != nil && *item.VariantID != "" {
				variant = *item.VariantID
			} else {
				variant = nil
			}
			if _, err := tx.Exec(
				`INSERT INTO cart_items (id, cart_id, product_id, variant_id, vendor_id, quantity, unit_price, title) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
				uuid.NewString(), cart.ID, item.ProductID, variant, vendorID, qty, price, title,
			); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(`UPDATE carts SET updated_at=NOW() WHERE id=$1`, cart.ID); err != nil {
			return err
		}
		items = []CartItem{}
		_ = tx.Select(&items, `SELECT id, cart_id, product_id, variant_id, vendor_id, quantity, unit_price, title FROM cart_items WHERE cart_id=$1`, cart.ID)
		if items == nil {
			items = []CartItem{}
		}
		return nil
	})
	if err != nil {
		var inactive syncInactiveProductError
		if errors.As(err, &inactive) {
			httpx.BadRequest(c, inactive.Error())
			return
		}
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"cart": cart, "items": items, "synced": len(items)})
}

func addItem(c *gin.Context, database *sqlx.DB) {
	var body struct {
		ProductID string  `json:"product_id" binding:"required"`
		VariantID *string `json:"variant_id"`
		Quantity  int     `json:"quantity"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if body.Quantity < 1 {
		body.Quantity = 1
	}
	tenantID := middleware.GetTenantID(c)
	var (
		respID                             string
		price                              float64
		title                              string
		qty                                int
		upserted, created                  bool
		inactive                           bool
	)
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		var vendorID *string
		var err error
		price, title, vendorID, err = lookupProductPrice(tx, tenantID, body.ProductID, body.VariantID)
		if err != nil {
			inactive = true
			return err
		}
		cart, err := resolveCart(c, tx)
		if err != nil {
			return err
		}
		var existingID string
		var existingQty int
		q := `SELECT id, quantity FROM cart_items WHERE cart_id=$1 AND product_id=$2 AND `
		if body.VariantID != nil && *body.VariantID != "" {
			err = tx.QueryRow(q+`variant_id=$3`, cart.ID, body.ProductID, *body.VariantID).Scan(&existingID, &existingQty)
		} else {
			err = tx.QueryRow(q+`variant_id IS NULL`, cart.ID, body.ProductID).Scan(&existingID, &existingQty)
		}
		if err == nil && existingID != "" {
			qty = existingQty + body.Quantity
			if _, err = tx.Exec(`UPDATE cart_items SET quantity=$1, unit_price=$2, title=$3 WHERE id=$4 AND cart_id=$5`, qty, price, title, existingID, cart.ID); err != nil {
				return err
			}
			_, _ = tx.Exec(`UPDATE carts SET updated_at=NOW() WHERE id=$1`, cart.ID)
			respID = existingID
			upserted = true
			return nil
		}
		id := uuid.NewString()
		if _, err = tx.Exec(`INSERT INTO cart_items (id, cart_id, product_id, variant_id, vendor_id, quantity, unit_price, title) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, id, cart.ID, body.ProductID, body.VariantID, vendorID, body.Quantity, price, title); err != nil {
			return err
		}
		_, _ = tx.Exec(`UPDATE carts SET updated_at=NOW() WHERE id=$1`, cart.ID)
		respID = id
		created = true
		return nil
	})
	if inactive {
		httpx.BadRequest(c, "product not found or inactive")
		return
	}
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if upserted {
		httpx.OK(c, gin.H{"id": respID, "unit_price": price, "title": title, "quantity": qty, "upserted": true})
		return
	}
	if created {
		httpx.Created(c, gin.H{"id": respID, "unit_price": price, "title": title})
	}
}
func updateItem(c *gin.Context, database *sqlx.DB) {
	var body struct {
		Quantity int `json:"quantity" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	var (
		notFound bool
		deleted  bool
	)
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		cart, err := resolveCart(c, tx)
		if err != nil {
			return err
		}
		if body.Quantity < 1 {
			res, _ := tx.Exec(`DELETE FROM cart_items WHERE id=$1 AND cart_id=$2`, c.Param("id"), cart.ID)
			if n, _ := res.RowsAffected(); n == 0 {
				notFound = true
			} else {
				deleted = true
			}
			return nil
		}
		res, err := tx.Exec(`UPDATE cart_items SET quantity=$1 WHERE id=$2 AND cart_id=$3`, body.Quantity, c.Param("id"), cart.ID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			notFound = true
		}
		return nil
	})
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if notFound {
		httpx.NotFound(c, "item not found")
		return
	}
	if deleted {
		c.Status(http.StatusNoContent)
		return
	}
	httpx.OK(c, gin.H{"updated": true})
}
func removeItem(c *gin.Context, database *sqlx.DB) {
	var notFound bool
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		cart, err := resolveCart(c, tx)
		if err != nil {
			return err
		}
		res, _ := tx.Exec(`DELETE FROM cart_items WHERE id=$1 AND cart_id=$2`, c.Param("id"), cart.ID)
		if n, _ := res.RowsAffected(); n == 0 {
			notFound = true
		}
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if notFound {
		httpx.NotFound(c, "item not found")
		return
	}
	c.Status(http.StatusNoContent)
}
func applyCoupon(c *gin.Context, database *sqlx.DB) {
	var body struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	invalid := false
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		var status string
		err := tx.Get(&status, `SELECT status FROM coupons WHERE tenant_id=$1 AND code=$2`, middleware.GetTenantID(c), body.Code)
		if err != nil || status != "active" {
			invalid = true
			return nil
		}
		cart, err := resolveCart(c, tx)
		if err != nil {
			return err
		}
		_, _ = tx.Exec(`UPDATE carts SET coupon_code=$1, updated_at=NOW() WHERE id=$2`, body.Code, cart.ID)
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if invalid {
		httpx.BadRequest(c, "invalid coupon")
		return
	}
	httpx.OK(c, gin.H{"coupon": body.Code})
}
func removeCoupon(c *gin.Context, database *sqlx.DB) {
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		cart, err := resolveCart(c, tx)
		if err != nil {
			return err
		}
		_, _ = tx.Exec(`UPDATE carts SET coupon_code=NULL WHERE id=$1`, cart.ID)
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}
func applyGift(c *gin.Context, database *sqlx.DB) {
	var body struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	invalid := false
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		var status string
		err := tx.Get(&status, `SELECT status FROM gift_certificates WHERE tenant_id=$1 AND code=$2`, middleware.GetTenantID(c), body.Code)
		if err != nil || status != "active" {
			invalid = true
			return nil
		}
		cart, err := resolveCart(c, tx)
		if err != nil {
			return err
		}
		_, _ = tx.Exec(`UPDATE carts SET gift_certificate_code=$1, updated_at=NOW() WHERE id=$2`, body.Code, cart.ID)
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if invalid {
		httpx.BadRequest(c, "invalid gift certificate")
		return
	}
	httpx.OK(c, gin.H{"gift_certificate": body.Code})
}
func removeGift(c *gin.Context, database *sqlx.DB) {
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		cart, err := resolveCart(c, tx)
		if err != nil {
			return err
		}
		_, _ = tx.Exec(`UPDATE carts SET gift_certificate_code=NULL WHERE id=$1`, cart.ID)
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}
func shippingEstimate(c *gin.Context) {
	var body struct {
		Region   string  `json:"region"`
		Subtotal float64 `json:"subtotal"`
	}
	_ = c.ShouldBindJSON(&body)
	cost := commerce.EstimateShipping(body.Region, body.Subtotal)
	eta := 2
	if cost == 0 {
		eta = 0
	}
	httpx.OK(c, gin.H{"currency": "UZS", "shipping_cost": cost, "eta_days": eta})
}
func checkoutPreview(c *gin.Context, database *sqlx.DB) {
	var body struct {
		Region string `json:"region"`
	}
	_ = c.ShouldBindJSON(&body)
	var (
		cart                                    *Cart
		items                                   []CartItem
		subtotal, discount, giftAmt, total float64
	)
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		var err error
		cart, err = resolveCart(c, tx)
		if err != nil {
			return err
		}
		items = []CartItem{}
		_ = tx.Select(&items, `SELECT id, cart_id, product_id, variant_id, vendor_id, quantity, unit_price, title FROM cart_items WHERE cart_id=$1`, cart.ID)
		if items == nil {
			items = []CartItem{}
		}
		subtotal, discount, giftAmt, total = calcTotals(tx, cart, items)
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	ship := commerce.EstimateShipping(body.Region, subtotal)
	httpx.OK(c, gin.H{"cart_id": cart.ID, "items": items, "subtotal": subtotal, "discount": discount, "gift": giftAmt, "shipping_cost": ship, "total": total + ship, "currency": "UZS"})
}
func mergeGuest(c *gin.Context, database *sqlx.DB) {
	var body struct {
		GuestID string `json:"guest_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	var merged int64
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		userCart, err := resolveCart(c, tx)
		if err != nil {
			return err
		}
		var guestCart Cart
		err = tx.Get(&guestCart, `SELECT id FROM carts WHERE tenant_id=$1 AND guest_id=$2 LIMIT 1`, middleware.GetTenantID(c), body.GuestID)
		if err != nil {
			merged = 0
			return nil
		}
		res, _ := tx.Exec(`UPDATE cart_items SET cart_id=$1 WHERE cart_id=$2`, userCart.ID, guestCart.ID)
		merged, _ = res.RowsAffected()
		_, _ = tx.Exec(`DELETE FROM carts WHERE id=$1`, guestCart.ID)
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"merged": merged})
}
func listAddresses(c *gin.Context, database *sqlx.DB) {
	claims := middleware.GetClaims(c)
	items := []Address{}
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		_ = tx.Select(&items, `SELECT id, tenant_id, user_id, label, full_name, phone, region, district, mahalla, street, building, apartment, postal_code, is_default FROM addresses WHERE user_id=$1 AND tenant_id=$2`, claims.UserID, middleware.GetTenantID(c))
		if items == nil {
			items = []Address{}
		}
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": items})
}
func createAddress(c *gin.Context, database *sqlx.DB) {
	claims := middleware.GetClaims(c)
	var body Address
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if body.Region == "" {
		httpx.BadRequest(c, "region required")
		return
	}
	id := uuid.NewString()
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(`INSERT INTO addresses (id, tenant_id, user_id, label, full_name, phone, region, district, mahalla, street, building, apartment, postal_code, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, id, middleware.GetTenantID(c), claims.UserID, body.Label, body.FullName, body.Phone, body.Region, body.District, body.Mahalla, body.Street, body.Building, body.Apartment, body.PostalCode, body.IsDefault)
		return err
	})
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.Created(c, gin.H{"id": id})
}
func updateAddress(c *gin.Context, database *sqlx.DB) {
	claims := middleware.GetClaims(c)
	var body Address
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		_, err := tx.Exec(`UPDATE addresses SET label=$1, full_name=$2, phone=$3, region=$4, district=$5, mahalla=$6, street=$7, building=$8, apartment=$9, postal_code=$10, is_default=$11 WHERE id=$12 AND user_id=$13`, body.Label, body.FullName, body.Phone, body.Region, body.District, body.Mahalla, body.Street, body.Building, body.Apartment, body.PostalCode, body.IsDefault, c.Param("id"), claims.UserID)
		return err
	})
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"updated": true})
}
func deleteAddress(c *gin.Context, database *sqlx.DB) {
	claims := middleware.GetClaims(c)
	_ = withTenant(c, database, func(tx *sqlx.Tx) error {
		_, _ = tx.Exec(`DELETE FROM addresses WHERE id=$1 AND user_id=$2`, c.Param("id"), claims.UserID)
		return nil
	})
	c.Status(http.StatusNoContent)
}
