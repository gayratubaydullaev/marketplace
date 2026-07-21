package service

import (
	"encoding/json"
	"strings"

	"github.com/gayrat/marketplace/services/catalog/internal/model"
)

// ProductJSONLD returns schema.org Product data suitable for storefront pages.
// It is deliberately JSON rather than an HTML script tag so callers can choose
// where and how to render it safely.
func ProductJSONLD(product model.Product) json.RawMessage {
	name := product.Slug
	description := ""
	var translations map[string]map[string]string
	if json.Unmarshal(product.Translations, &translations) == nil {
		if uz := translations["uz"]; uz != nil {
			if uz["name"] != "" {
				name = uz["name"]
			}
			description = uz["description"]
		}
	}
	var seo map[string]any
	_ = json.Unmarshal(product.SEO, &seo)
	if title, ok := seo["title"].(string); ok && title != "" {
		name = title
	}
	if meta, ok := seo["description"].(string); ok && meta != "" {
		description = meta
	}
	var images []string
	_ = json.Unmarshal(product.Images, &images)
	availability := "https://schema.org/InStock"
	if product.Status == "out_of_stock" || product.InventoryQuantity <= 0 {
		availability = "https://schema.org/OutOfStock"
	}
	document := map[string]any{
		"@context":    "https://schema.org",
		"@type":       "Product",
		"name":        name,
		"description": description,
		"sku":         product.SKU,
		"image":       images,
		"offers": map[string]any{
			"@type":         "Offer",
			"price":         product.Price,
			"priceCurrency": strings.ToUpper(product.Currency),
			"availability":  availability,
		},
	}
	raw, err := json.Marshal(document)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return raw
}
