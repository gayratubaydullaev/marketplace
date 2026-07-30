package handler

import (
	"database/sql"
	"net/http"

	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/cart/internal/model"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

func (h *CartHandler) GetWishlist(c *gin.Context)       { getWishlist(c, h.Service.Repo.DB) }
func (h *CartHandler) AddWishlistItem(c *gin.Context)   { addWishlistItem(c, h.Service.Repo.DB) }
func (h *CartHandler) RemoveWishlistItem(c *gin.Context) { removeWishlistItem(c, h.Service.Repo.DB) }
func (h *CartHandler) MergeWishlist(c *gin.Context)     { mergeWishlist(c, h.Service.Repo.DB) }

func resolveWishlist(c *gin.Context, q querier) (string, error) {
	claims := middleware.GetClaims(c)
	if claims == nil {
		return "", sql.ErrNoRows
	}
	tenantID := middleware.GetTenantID(c)
	var id string
	err := q.Get(&id, `SELECT id FROM wishlists WHERE tenant_id=$1 AND user_id=$2`, tenantID, claims.UserID)
	if err == sql.ErrNoRows {
		id = uuid.NewString()
		_, err = q.Exec(`INSERT INTO wishlists (id, tenant_id, user_id) VALUES ($1,$2,$3)`, id, tenantID, claims.UserID)
	}
	return id, err
}

func getWishlist(c *gin.Context, database *sqlx.DB) {
	var items []model.WishlistItem
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		wishlistID, err := resolveWishlist(c, tx)
		if err != nil {
			return err
		}
		items = []model.WishlistItem{}
		return tx.Select(&items, `SELECT id, wishlist_id, tenant_id, product_id, variant_id, created_at FROM wishlist_items WHERE wishlist_id=$1 ORDER BY created_at DESC`, wishlistID)
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

type wishlistItemRequest struct {
	ProductID string  `json:"product_id" binding:"required"`
	VariantID *string `json:"variant_id"`
}

func addWishlistItem(c *gin.Context, database *sqlx.DB) {
	var body wishlistItemRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	var item model.WishlistItem
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		wishlistID, err := resolveWishlist(c, tx)
		if err != nil {
			return err
		}
		id := uuid.NewString()
		if _, err = tx.Exec(`INSERT INTO wishlist_items (id, wishlist_id, tenant_id, product_id, variant_id)
			VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, id, wishlistID, middleware.GetTenantID(c), body.ProductID, body.VariantID); err != nil {
			return err
		}
		query := `SELECT id, wishlist_id, tenant_id, product_id, variant_id, created_at FROM wishlist_items WHERE wishlist_id=$1 AND product_id=$2 AND `
		if body.VariantID == nil || *body.VariantID == "" {
			return tx.Get(&item, query+`variant_id IS NULL`, wishlistID, body.ProductID)
		}
		return tx.Get(&item, query+`variant_id=$3`, wishlistID, body.ProductID, *body.VariantID)
	})
	if err != nil {
		httpx.WriteDBError(c, err)
		return
	}
	httpx.Created(c, item)
}

func removeWishlistItem(c *gin.Context, database *sqlx.DB) {
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		wishlistID, err := resolveWishlist(c, tx)
		if err != nil {
			return err
		}
		_, err = tx.Exec(`DELETE FROM wishlist_items WHERE id=$1 AND wishlist_id=$2`, c.Param("id"), wishlistID)
		return err
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func mergeWishlist(c *gin.Context, database *sqlx.DB) {
	var body struct {
		Items []wishlistItemRequest `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	err := withTenant(c, database, func(tx *sqlx.Tx) error {
		wishlistID, err := resolveWishlist(c, tx)
		if err != nil {
			return err
		}
		tenantID := middleware.GetTenantID(c)
		for _, item := range body.Items {
			if item.ProductID == "" {
				continue
			}
			if _, err := tx.Exec(`INSERT INTO wishlist_items (id, wishlist_id, tenant_id, product_id, variant_id)
				VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, uuid.NewString(), wishlistID, tenantID, item.ProductID, item.VariantID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"merged": true})
}
