package handler

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/catalog/internal/model"
	"github.com/gayrat/marketplace/services/catalog/internal/repository"
	"github.com/gayrat/marketplace/services/catalog/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct {
	Service  *service.Catalog
	Producer *kafkax.Producer
	TokenMgr *commonauth.Manager
}

func New(catalogService *service.Catalog, producer *kafkax.Producer, tokenMgr *commonauth.Manager) *Handler {
	return &Handler{Service: catalogService, Producer: producer, TokenMgr: tokenMgr}
}

func (h *Handler) Register(r *gin.Engine) {
	v1 := r.Group("/v1")
	v1.GET("/categories", h.listCategories)
	v1.GET("/categories/:slug/products", h.listProductsByCategory)
	v1.GET("/products", h.listProducts)
	v1.GET("/products/by-id/:id", h.getProductByID)
	v1.GET("/products/:slug", h.getProduct)
	v1.GET("/products/:slug/related", h.relatedProducts)
	v1.POST("/products", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin, commonauth.RoleManager), h.createProduct)
	v1.PUT("/products/:id", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin, commonauth.RoleManager), h.updateProduct)
	v1.DELETE("/products/:id", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin), h.archiveProduct)
	v1.POST("/products/:id/variants", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin, commonauth.RoleManager), h.createVariant)
	v1.GET("/products/id/:id/variants", h.listVariants)
	v1.POST("/products/bulk", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleVendor), h.bulkCreate)
	v1.POST("/products/import/csv", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleVendor), h.importCSV)
	v1.POST("/products/import/xlsx", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleVendor), h.importXLSX)
	v1.GET("/products/export/csv", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleVendor, commonauth.RoleManager), h.exportCSV)
	v1.POST("/products/:id/images", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleVendor, commonauth.RoleTenantAdmin, commonauth.RoleManager), h.attachImages)
	v1.GET("/sitemap.xml", h.sitemap)
	v1.GET("/home/banners", h.listPublicHeroBanners)
	v1.GET("/home/promo-banners", h.listPublicPromoBanners)
	v1.POST("/categories", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin), h.createCategory)
	v1.PUT("/categories/:id", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin), h.updateCategory)
	v1.DELETE("/categories/:id", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin), h.deleteCategory)

	admin := v1.Group("/admin", middleware.JWT(h.TokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager))
	{
		admin.GET("/coupons", h.listCoupons)
		admin.POST("/coupons", h.createCoupon)
		admin.GET("/coupons/:id", h.getCoupon)
		admin.PUT("/coupons/:id", h.updateCoupon)
		admin.DELETE("/coupons/:id", h.deleteCoupon)
		admin.GET("/gift-certificates", h.listGiftCertificates)
		admin.POST("/gift-certificates", h.createGiftCertificate)
		admin.PUT("/gift-certificates/:id", h.updateGiftCertificate)
		admin.DELETE("/gift-certificates/:id", h.deleteGiftCertificate)
		admin.POST("/products/:id/moderate", h.moderateProduct)
		admin.GET("/hero-banners", h.listAdminHeroBanners)
		admin.POST("/hero-banners", h.createHeroBanner)
		admin.PUT("/hero-banners/:id", h.updateHeroBanner)
		admin.DELETE("/hero-banners/:id", h.deleteHeroBanner)
	}
}

func (h *Handler) repo() *repository.Catalog { return h.Service.Repository() }

func (h *Handler) databaseUnavailable(c *gin.Context) bool {
	if h.repo().Available() {
		return false
	}
	httpx.Internal(c, "database unavailable")
	return true
}

func (h *Handler) listCategories(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	categories, err := h.repo().ListCategories(middleware.GetTenantID(c))
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": categories})
}

func (h *Handler) createCategory(c *gin.Context) {
	var body model.CreateCategoryRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	id := uuid.NewString()
	if err := h.repo().CreateCategory(id, middleware.GetTenantID(c), body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.Created(c, gin.H{"id": id})
}

func (h *Handler) updateCategory(c *gin.Context) {
	var body model.UpdateCategoryRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if err := h.repo().UpdateCategory(middleware.GetTenantID(c), c.Param("id"), body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"id": c.Param("id")})
}

func (h *Handler) deleteCategory(c *gin.Context) {
	if err := h.repo().DeleteCategory(middleware.GetTenantID(c), c.Param("id")); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) getProductByID(c *gin.Context) {
	product, err := h.repo().GetProductByID(middleware.GetTenantID(c), c.Param("id"))
	if repository.IsNoRows(err) {
		httpx.NotFound(c, "product not found")
		return
	}
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	variants, _ := h.repo().ListVariants(product.ID)
	httpx.OK(c, gin.H{"product": product, "variants": variants})
}

func (h *Handler) listProducts(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	opts := repository.ProductListOpts{
		Status:   c.DefaultQuery("status", "active"),
		Featured: c.Query("featured"),
		VendorID: c.Query("vendor_id"),
		Sort:     c.Query("sort"),
		Limit:    limit,
		Offset:   (page - 1) * limit,
	}
	if v := c.Query("min_price"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			opts.MinPrice = &f
		}
	}
	if v := c.Query("max_price"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			opts.MaxPrice = &f
		}
	}
	items, total, err := h.repo().ListProducts(middleware.GetTenantID(c), opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": items, "page": page, "limit": limit, "total": total})
}

func (h *Handler) listProductsByCategory(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	categoryID, err := h.repo().CategoryIDBySlug(tenantID, c.Param("slug"))
	if err != nil {
		httpx.NotFound(c, "category not found")
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	opts := repository.ProductListOpts{
		Sort:   c.Query("sort"),
		Limit:  limit,
		Offset: (page - 1) * limit,
	}
	if v := c.Query("min_price"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			opts.MinPrice = &f
		}
	}
	if v := c.Query("max_price"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			opts.MaxPrice = &f
		}
	}
	items, total, err := h.repo().ListProductsByCategory(tenantID, categoryID, opts)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": items, "page": page, "limit": limit, "total": total})
}

func (h *Handler) getProduct(c *gin.Context) {
	product, err := h.repo().GetProductBySlug(middleware.GetTenantID(c), c.Param("slug"))
	if repository.IsNoRows(err) {
		httpx.NotFound(c, "product not found")
		return
	}
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	variants, _ := h.repo().ListVariants(product.ID)
	httpx.OK(c, gin.H{"product": product, "variants": variants})
}

func (h *Handler) relatedProducts(c *gin.Context) {
	tenantID, slug := middleware.GetTenantID(c), c.Param("slug")
	categoryID, _ := h.repo().ProductCategoryIDBySlug(tenantID, slug)
	items, _ := h.repo().ListRelatedProducts(tenantID, categoryID, slug)
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) createProduct(c *gin.Context) {
	var body model.CreateProductRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if body.Currency == "" {
		body.Currency = "UZS"
	}
	if body.Status == "" {
		body.Status = "draft"
	}
	if body.SEO == nil {
		body.SEO = json.RawMessage(`{}`)
	}
	if body.Attributes == nil {
		body.Attributes = json.RawMessage(`{}`)
	}
	if body.Images == nil {
		body.Images = json.RawMessage(`[]`)
	}
	claims := middleware.GetClaims(c)
	if claims.Role == commonauth.RoleVendor && claims.VendorID != "" {
		vendorID := claims.VendorID
		body.VendorID = &vendorID
	}
	id, tenantID := uuid.NewString(), middleware.GetTenantID(c)
	if err := h.repo().CreateProduct(id, tenantID, body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	h.publish(c, "product.created", id, gin.H{"id": id, "tenant_id": tenantID, "slug": body.Slug})
	httpx.Created(c, gin.H{"id": id})
}

func (h *Handler) updateProduct(c *gin.Context) {
	var body map[string]any
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if !hasAllowedProductField(body) {
		httpx.BadRequest(c, "no fields to update")
		return
	}
	id, tenantID := c.Param("id"), middleware.GetTenantID(c)
	if err := h.repo().UpdateProduct(id, tenantID, body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	h.publish(c, "product.updated", id, gin.H{"id": id, "tenant_id": tenantID})
	httpx.OK(c, gin.H{"id": id, "updated": true})
}

func (h *Handler) archiveProduct(c *gin.Context) {
	id := c.Param("id")
	if err := h.repo().ArchiveProduct(id, middleware.GetTenantID(c)); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.publish(c, "product.updated", id, gin.H{"id": id, "status": "archived"})
	c.Status(http.StatusNoContent)
}

func (h *Handler) createVariant(c *gin.Context) {
	var body model.CreateVariantRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if body.Attributes == nil {
		body.Attributes = json.RawMessage(`{}`)
	}
	if len(body.Images) > 0 {
		var attrs map[string]any
		_ = json.Unmarshal(body.Attributes, &attrs)
		if attrs == nil {
			attrs = map[string]any{}
		}
		attrs["images"] = body.Images
		if body.ImageURL == nil && body.Images[0] != "" {
			u := body.Images[0]
			body.ImageURL = &u
		}
		raw, err := json.Marshal(attrs)
		if err == nil {
			body.Attributes = raw
		}
	}
	id := uuid.NewString()
	if err := h.repo().CreateVariant(id, middleware.GetTenantID(c), c.Param("id"), body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.Created(c, gin.H{"id": id})
}

func (h *Handler) listVariants(c *gin.Context) {
	items, _ := h.repo().ListVariants(c.Param("id"))
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) bulkCreate(c *gin.Context) {
	var body model.BulkCreateRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if len(body.Products) > 10000 {
		httpx.BadRequest(c, "max 10000 products per bulk")
		return
	}
	ids, _ := h.Service.BulkCreate(middleware.GetTenantID(c), body.Products)
	for _, id := range ids {
		h.publish(c, "product.created", id, gin.H{"id": id})
	}
	httpx.OK(c, gin.H{"created": len(ids)})
}

func (h *Handler) importCSV(c *gin.Context) {
	h.importProducts(c, "CSV")
}

// importXLSX accepts a CSV-compatible spreadsheet export. Native .xlsx parsing
// can be added later without changing the client endpoint.
func (h *Handler) importXLSX(c *gin.Context) {
	h.importProducts(c, "CSV-compatible XLSX")
}

func (h *Handler) importProducts(c *gin.Context, format string) {
	file, err := c.FormFile("file")
	if err != nil {
		httpx.BadRequest(c, format+" file required (field=file). Columns: slug,category_id,name_uz,name_ru,price,inventory")
		return
	}
	input, err := file.Open()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	defer input.Close()
	ids, err := h.Service.ImportCSV(middleware.GetTenantID(c), input)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	for _, id := range ids {
		h.publish(c, "product.created", id, gin.H{"id": id})
	}
	httpx.OK(c, gin.H{"created": len(ids), "format": format})
}

func (h *Handler) exportCSV(c *gin.Context) {
	rows, err := h.repo().ExportProducts(middleware.GetTenantID(c))
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	defer rows.Close()
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", "attachment; filename=products.csv")
	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{"slug", "category_id", "name_uz", "name_ru", "price", "inventory", "status"})
	for rows.Next() {
		var slug, category, nameUZ, nameRU, status sql.NullString
		var price float64
		var inventory int
		_ = rows.Scan(&slug, &category, &nameUZ, &nameRU, &price, &inventory, &status)
		_ = writer.Write([]string{slug.String, category.String, nameUZ.String, nameRU.String, fmt.Sprintf("%.0f", price), strconv.Itoa(inventory), status.String})
	}
	writer.Flush()
}

func (h *Handler) attachImages(c *gin.Context) {
	var body model.AttachImagesRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if len(body.URLs) > 20 {
		httpx.BadRequest(c, "max 20 images")
		return
	}
	images, _ := json.Marshal(body.URLs)
	if err := h.repo().AttachImages(c.Param("id"), middleware.GetTenantID(c), images); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"images": body.URLs})
}

func (h *Handler) sitemap(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	productSlugs, err := h.repo().ListActiveProductSlugs(tenantID)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	categorySlugs, err := h.repo().ListActiveCategorySlugs(tenantID)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	var builder strings.Builder
	builder.WriteString(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
	for _, slug := range productSlugs {
		writeSitemapURL(&builder, "products", slug)
	}
	for _, slug := range categorySlugs {
		writeSitemapURL(&builder, "categories", slug)
	}
	builder.WriteString("</urlset>")
	c.Data(http.StatusOK, "application/xml", []byte(builder.String()))
}

func writeSitemapURL(builder *strings.Builder, resource, slug string) {
	for _, locale := range []string{"uz", "ru"} {
		var location strings.Builder
		location.WriteString("https://gayrat.uz/")
		location.WriteString(locale)
		location.WriteString("/")
		location.WriteString(resource)
		location.WriteString("/")
		location.WriteString(slug)
		builder.WriteString("<url><loc>")
		_ = xml.EscapeText(builder, []byte(location.String()))
		builder.WriteString("</loc></url>")
	}
}

func (h *Handler) moderateProduct(c *gin.Context) {
	var body struct {
		Status string `json:"status" binding:"required"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if body.Status != "active" && body.Status != "rejected" {
		httpx.BadRequest(c, "status must be active or rejected")
		return
	}
	tenantID, productID := middleware.GetTenantID(c), c.Param("id")
	product, err := h.repo().GetProductByID(tenantID, productID)
	if repository.IsNoRows(err) {
		httpx.NotFound(c, "product not found")
		return
	}
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if product.Status != "pending_review" {
		httpx.BadRequest(c, "only pending_review products can be moderated")
		return
	}
	if !service.ValidateStatusTransition(product.Status, body.Status) {
		httpx.BadRequest(c, "cannot transition "+product.Status+" -> "+body.Status)
		return
	}
	if err := h.repo().ModerateProduct(tenantID, productID, body.Status, body.Reason); err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	h.publish(c, "product.moderated", productID, gin.H{"id": productID, "tenant_id": tenantID, "status": body.Status})
	httpx.OK(c, gin.H{"id": productID, "status": body.Status, "reason": body.Reason})
}

func (h *Handler) publish(c *gin.Context, topic, key string, message any) {
	_ = h.Producer.Publish(c.Request.Context(), topic, key, message)
}

func hasAllowedProductField(body map[string]any) bool {
	for _, key := range []string{"translations", "price", "compare_at_price", "inventory_quantity", "status", "is_featured", "seo", "attributes", "images", "category_id"} {
		if _, ok := body[key]; ok {
			return true
		}
	}
	return false
}

func (h *Handler) listCoupons(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	items, err := h.repo().ListCoupons(middleware.GetTenantID(c))
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) getCoupon(c *gin.Context) {
	coupon, err := h.repo().GetCoupon(middleware.GetTenantID(c), c.Param("id"))
	if err != nil {
		httpx.NotFound(c, "coupon not found")
		return
	}
	httpx.OK(c, coupon)
}

func (h *Handler) createCoupon(c *gin.Context) {
	var body model.CreateCouponRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if body.Type != "percent" && body.Type != "fixed" {
		httpx.BadRequest(c, "type must be percent or fixed")
		return
	}
	id := uuid.NewString()
	if err := h.repo().CreateCoupon(id, middleware.GetTenantID(c), body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.Created(c, gin.H{"id": id, "code": strings.ToUpper(body.Code)})
}

func (h *Handler) updateCoupon(c *gin.Context) {
	var body model.UpdateCouponRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if err := h.repo().UpdateCoupon(middleware.GetTenantID(c), c.Param("id"), body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"id": c.Param("id")})
}

func (h *Handler) deleteCoupon(c *gin.Context) {
	if err := h.repo().DeleteCoupon(middleware.GetTenantID(c), c.Param("id")); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) listGiftCertificates(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	items, err := h.repo().ListGiftCertificates(middleware.GetTenantID(c))
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if items == nil {
		items = []model.GiftCertificate{}
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) createGiftCertificate(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	var body model.CreateGiftCertificateRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if body.Balance <= 0 {
		httpx.BadRequest(c, "balance must be > 0")
		return
	}
	id := uuid.NewString()
	if err := h.repo().CreateGiftCertificate(id, middleware.GetTenantID(c), body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.Created(c, gin.H{"id": id, "code": strings.ToUpper(body.Code)})
}

func (h *Handler) updateGiftCertificate(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	var body model.UpdateGiftCertificateRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if err := h.repo().UpdateGiftCertificate(middleware.GetTenantID(c), c.Param("id"), body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"id": c.Param("id")})
}

func (h *Handler) deleteGiftCertificate(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	if err := h.repo().DeleteGiftCertificate(middleware.GetTenantID(c), c.Param("id")); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) listPublicHeroBanners(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	items, err := h.repo().ListHeroBanners(middleware.GetTenantID(c), true, "hero")
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if items == nil {
		items = []model.HeroBanner{}
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) listPublicPromoBanners(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	items, err := h.repo().ListHeroBanners(middleware.GetTenantID(c), true, "promo")
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if items == nil {
		items = []model.HeroBanner{}
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) listAdminHeroBanners(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	kind := c.DefaultQuery("kind", "all")
	items, err := h.repo().ListHeroBanners(middleware.GetTenantID(c), false, kind)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	if items == nil {
		items = []model.HeroBanner{}
	}
	httpx.OK(c, gin.H{"items": items})
}

func (h *Handler) createHeroBanner(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	var body model.CreateHeroBannerRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if strings.TrimSpace(body.ImageURL) == "" {
		httpx.BadRequest(c, "image_url required")
		return
	}
	id := uuid.NewString()
	if err := h.repo().CreateHeroBanner(id, middleware.GetTenantID(c), body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.Created(c, gin.H{"id": id})
}

func (h *Handler) updateHeroBanner(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	var body model.UpdateHeroBannerRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	if err := h.repo().UpdateHeroBanner(middleware.GetTenantID(c), c.Param("id"), body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"id": c.Param("id")})
}

func (h *Handler) deleteHeroBanner(c *gin.Context) {
	if h.databaseUnavailable(c) {
		return
	}
	if err := h.repo().DeleteHeroBanner(middleware.GetTenantID(c), c.Param("id")); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}
