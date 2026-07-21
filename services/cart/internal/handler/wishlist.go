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

func resolveWishlist(c *gin.Context, database *sqlx.DB) (string, error) {
	claims := middleware.GetClaims(c)
	if claims == nil {
		return "", sql.ErrNoRows
	}
	tenantID := middleware.GetTenantID(c)
	var id string
	err := database.Get(&id, `SELECT id FROM wishlists WHERE tenant_id=$1 AND user_id=$2`, tenantID, claims.UserID)
	if err == sql.ErrNoRows {
		id = uuid.NewString()
		_, err = database.Exec(`INSERT INTO wishlists (id, tenant_id, user_id) VALUES ($1,$2,$3)`, id, tenantID, claims.UserID)
	}
	return id, err
}

func getWishlist(c *gin.Context, database *sqlx.DB) {
	wishlistID, err := resolveWishlist(c, database)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	items := []model.WishlistItem{}
	if err := database.Select(&items, `SELECT id, wishlist_id, tenant_id, product_id, variant_id, created_at FROM wishlist_items WHERE wishlist_id=$1 ORDER BY created_at DESC`, wishlistID); err != nil {
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
	wishlistID, err := resolveWishlist(c, database)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	id := uuid.NewString()
	_, err = database.Exec(`INSERT INTO wishlist_items (id, wishlist_id, tenant_id, product_id, variant_id)
		VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, id, wishlistID, middleware.GetTenantID(c), body.ProductID, body.VariantID)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	var item model.WishlistItem
	query := `SELECT id, wishlist_id, tenant_id, product_id, variant_id, created_at FROM wishlist_items WHERE wishlist_id=$1 AND product_id=$2 AND `
	if body.VariantID == nil || *body.VariantID == "" {
		err = database.Get(&item, query+`variant_id IS NULL`, wishlistID, body.ProductID)
	} else {
		err = database.Get(&item, query+`variant_id=$3`, wishlistID, body.ProductID, *body.VariantID)
	}
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.Created(c, gin.H{"item": item})
}

func removeWishlistItem(c *gin.Context, database *sqlx.DB) {
	wishlistID, err := resolveWishlist(c, database)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	res, err := database.Exec(`DELETE FROM wishlist_items WHERE id=$1 AND wishlist_id=$2`, c.Param("id"), wishlistID)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpx.NotFound(c, "item not found")
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
	wishlistID, err := resolveWishlist(c, database)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	merged := 0
	for _, item := range body.Items {
		if item.ProductID == "" {
			continue
		}
		res, err := database.Exec(`INSERT INTO wishlist_items (id, wishlist_id, tenant_id, product_id, variant_id)
			VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, uuid.NewString(), wishlistID, middleware.GetTenantID(c), item.ProductID, item.VariantID)
		if err != nil {
			httpx.Internal(c, err.Error())
			return
		}
		if n, _ := res.RowsAffected(); n > 0 {
			merged++
		}
	}
	httpx.OK(c, gin.H{"merged": merged})
}
