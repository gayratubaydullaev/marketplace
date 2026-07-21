package model

import (
	"encoding/json"
	"time"
)

type Product struct {
	ID                string          `db:"id" json:"id"`
	TenantID          string          `db:"tenant_id" json:"tenant_id"`
	VendorID          *string         `db:"vendor_id" json:"vendor_id"`
	CategoryID        string          `db:"category_id" json:"category_id"`
	Slug              string          `db:"slug" json:"slug"`
	Translations      json.RawMessage `db:"translations" json:"translations"`
	SKU               *string         `db:"sku" json:"sku"`
	Price             float64         `db:"price" json:"price"`
	CompareAtPrice    *float64        `db:"compare_at_price" json:"compare_at_price"`
	CostPrice         *float64        `db:"cost_price" json:"cost_price"`
	Currency          string          `db:"currency" json:"currency"`
	InventoryQuantity int             `db:"inventory_quantity" json:"inventory_quantity"`
	InventoryPolicy   string          `db:"inventory_policy" json:"inventory_policy"`
	Status            string          `db:"status" json:"status"`
	IsFeatured        bool            `db:"is_featured" json:"is_featured"`
	SEO               json.RawMessage `db:"seo" json:"seo"`
	Attributes        json.RawMessage `db:"attributes" json:"attributes"`
	Images            json.RawMessage `db:"images" json:"images"`
	CreatedAt         time.Time       `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time       `db:"updated_at" json:"updated_at"`
}

type Category struct {
	ID           string          `db:"id" json:"id"`
	TenantID     string          `db:"tenant_id" json:"tenant_id"`
	ParentID     *string         `db:"parent_id" json:"parent_id"`
	Slug         string          `db:"slug" json:"slug"`
	Translations json.RawMessage `db:"translations" json:"translations"`
	SortOrder    int             `db:"sort_order" json:"sort_order"`
	Status       string          `db:"status" json:"status"`
}

type Variant struct {
	ID                string          `db:"id" json:"id"`
	TenantID          string          `db:"tenant_id" json:"tenant_id"`
	ProductID         string          `db:"product_id" json:"product_id"`
	SKU               string          `db:"sku" json:"sku"`
	Title             *string         `db:"title" json:"title"`
	Attributes        json.RawMessage `db:"attributes" json:"attributes"`
	Price             float64         `db:"price" json:"price"`
	InventoryQuantity int             `db:"inventory_quantity" json:"inventory_quantity"`
	ImageURL          *string         `db:"image_url" json:"image_url,omitempty"`
	Status            string          `db:"status" json:"status"`
}

type CreateCategoryRequest struct {
	Slug             string          `json:"slug" binding:"required"`
	ParentID         *string         `json:"parent_id"`
	Translations     json.RawMessage `json:"translations" binding:"required"`
	SortOrder        int             `json:"sort_order"`
	AttributesSchema json.RawMessage `json:"attributes_schema"`
}

type UpdateCategoryRequest struct {
	ParentID         *string         `json:"parent_id"`
	Translations     json.RawMessage `json:"translations"`
	SortOrder        *int            `json:"sort_order"`
	AttributesSchema json.RawMessage `json:"attributes_schema"`
	Status           *string         `json:"status"`
}

type CreateProductRequest struct {
	VendorID          *string         `json:"vendor_id"`
	CategoryID        string          `json:"category_id" binding:"required"`
	Slug              string          `json:"slug" binding:"required"`
	Translations      json.RawMessage `json:"translations" binding:"required"`
	SKU               *string         `json:"sku"`
	Price             float64         `json:"price" binding:"required"`
	CompareAtPrice    *float64        `json:"compare_at_price"`
	Currency          string          `json:"currency"`
	InventoryQuantity int             `json:"inventory_quantity"`
	Status            string          `json:"status"`
	IsFeatured        bool            `json:"is_featured"`
	SEO               json.RawMessage `json:"seo"`
	Attributes        json.RawMessage `json:"attributes"`
	Images            json.RawMessage `json:"images"`
}

type CreateVariantRequest struct {
	SKU               string          `json:"sku" binding:"required"`
	Title             string          `json:"title"`
	Attributes        json.RawMessage `json:"attributes"`
	Price             float64         `json:"price" binding:"required"`
	InventoryQuantity int             `json:"inventory_quantity"`
	ImageURL          *string         `json:"image_url"`
	Images            []string        `json:"images"`
}

type BulkProductRequest struct {
	CategoryID   string          `json:"category_id"`
	Slug         string          `json:"slug"`
	Translations json.RawMessage `json:"translations"`
	Price        float64         `json:"price"`
	VendorID     *string         `json:"vendor_id"`
}

type BulkCreateRequest struct {
	Products []BulkProductRequest `json:"products"`
}

type BulkEditRequest struct {
	IDs        []string `json:"ids" binding:"required,min=1,max=10000"`
	Price      *float64 `json:"price"`
	Status     *string  `json:"status"`
	CategoryID *string  `json:"category_id"`
}

type AttachImagesRequest struct {
	URLs []string `json:"urls" binding:"required"`
}

type Coupon struct {
	ID        string     `db:"id" json:"id"`
	TenantID  string     `db:"tenant_id" json:"tenant_id"`
	Code      string     `db:"code" json:"code"`
	Type      string     `db:"type" json:"type"`
	Value     float64    `db:"value" json:"value"`
	MinOrder  float64    `db:"min_order" json:"min_order"`
	MaxUses   *int       `db:"max_uses" json:"max_uses"`
	UsedCount int        `db:"used_count" json:"used_count"`
	StartsAt  *time.Time `db:"starts_at" json:"starts_at"`
	EndsAt    *time.Time `db:"ends_at" json:"ends_at"`
	Status    string     `db:"status" json:"status"`
}

type CreateCouponRequest struct {
	Code     string     `json:"code" binding:"required"`
	Type     string     `json:"type" binding:"required"`
	Value    float64    `json:"value" binding:"required"`
	MinOrder float64    `json:"min_order"`
	MaxUses  *int       `json:"max_uses"`
	StartsAt *time.Time `json:"starts_at"`
	EndsAt   *time.Time `json:"ends_at"`
	Status   string     `json:"status"`
}

type UpdateCouponRequest struct {
	Type     *string    `json:"type"`
	Value    *float64   `json:"value"`
	MinOrder *float64   `json:"min_order"`
	MaxUses  *int       `json:"max_uses"`
	StartsAt *time.Time `json:"starts_at"`
	EndsAt   *time.Time `json:"ends_at"`
	Status   *string    `json:"status"`
}

type GiftCertificate struct {
	ID        string     `db:"id" json:"id"`
	TenantID  string     `db:"tenant_id" json:"tenant_id"`
	Code      string     `db:"code" json:"code"`
	Balance   float64    `db:"balance" json:"balance"`
	Currency  string     `db:"currency" json:"currency"`
	Status    string     `db:"status" json:"status"`
	ExpiresAt *time.Time `db:"expires_at" json:"expires_at"`
	CreatedAt time.Time  `db:"created_at" json:"created_at"`
}

type CreateGiftCertificateRequest struct {
	Code      string     `json:"code" binding:"required"`
	Balance   float64    `json:"balance" binding:"required"`
	Currency  string     `json:"currency"`
	Status    string     `json:"status"`
	ExpiresAt *time.Time `json:"expires_at"`
}

type UpdateGiftCertificateRequest struct {
	Balance   *float64   `json:"balance"`
	Currency  *string    `json:"currency"`
	Status    *string    `json:"status"`
	ExpiresAt *time.Time `json:"expires_at"`
}

type HeroBanner struct {
	ID        string `db:"id" json:"id"`
	TenantID  string `db:"tenant_id" json:"tenant_id"`
	Kind      string `db:"kind" json:"kind"`
	ImageURL  string `db:"image_url" json:"image_url"`
	Headline  string `db:"headline" json:"headline"`
	Sub       string `db:"sub" json:"sub"`
	CtaLabel  string `db:"cta_label" json:"cta_label"`
	CtaHref   string `db:"cta_href" json:"cta_href"`
	Cta2Label string `db:"cta2_label" json:"cta2_label"`
	Cta2Href  string `db:"cta2_href" json:"cta2_href"`
	SortOrder int    `db:"sort_order" json:"sort_order"`
	Active    bool   `db:"active" json:"active"`
	ShowBrand bool   `db:"show_brand" json:"show_brand"`
}

type CreateHeroBannerRequest struct {
	Kind      string `json:"kind"`
	ImageURL  string `json:"image_url" binding:"required"`
	Headline  string `json:"headline"`
	Sub       string `json:"sub"`
	CtaLabel  string `json:"cta_label"`
	CtaHref   string `json:"cta_href"`
	Cta2Label string `json:"cta2_label"`
	Cta2Href  string `json:"cta2_href"`
	SortOrder int    `json:"sort_order"`
	Active    *bool  `json:"active"`
	ShowBrand *bool  `json:"show_brand"`
}

type UpdateHeroBannerRequest struct {
	Kind      *string `json:"kind"`
	ImageURL  *string `json:"image_url"`
	Headline  *string `json:"headline"`
	Sub       *string `json:"sub"`
	CtaLabel  *string `json:"cta_label"`
	CtaHref   *string `json:"cta_href"`
	Cta2Label *string `json:"cta2_label"`
	Cta2Href  *string `json:"cta2_href"`
	SortOrder *int    `json:"sort_order"`
	Active    *bool   `json:"active"`
	ShowBrand *bool   `json:"show_brand"`
}
