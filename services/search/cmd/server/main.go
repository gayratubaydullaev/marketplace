package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/config"
	"github.com/gayrat/marketplace/packages/go-common/db"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	kafkax "github.com/gayrat/marketplace/packages/go-common/kafka"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/segmentio/kafka-go"
)

func main() {
	cfg := config.Load("search-service")
	if err := cfg.ValidateSecrets(); err != nil {
		log.Fatal(err)
	}
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8003"
	}
	database, _ := db.Connect(cfg.DatabaseURL)
	esURL := cfg.ElasticsearchURL

	go consumeProducts(cfg.KafkaBrokers, database, esURL)
	_ = ensureIndex(esURL)

	tokenMgr := commonauth.NewManager(cfg.JWTSecret, cfg.JWTAccessTTLMinutes, cfg.JWTRefreshTTLDays)
	if database != nil {
		_, _ = database.Exec(`CREATE TABLE IF NOT EXISTS search_synonyms (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id UUID NOT NULL,
			term VARCHAR(100) NOT NULL,
			synonyms TEXT[] NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE(tenant_id, term)
		)`)
	}

	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS(), middleware.SecurityHeaders(), middleware.MaxBodyBytes(0), middleware.Tenant(), middleware.TenantDB(database), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	v1 := r.Group("/v1/search")
	{
		v1.GET("", func(c *gin.Context) { search(c, database, esURL) })
		v1.GET("/suggest", func(c *gin.Context) { suggest(c, database, esURL) })
		v1.GET("/popular", func(c *gin.Context) { popularSearches(c, database) })
		v1.GET("/facets", func(c *gin.Context) { facets(c, database) })
		v1.POST("/reindex", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleSuperAdmin, commonauth.RoleManager), func(c *gin.Context) { reindex(c, database, esURL) })
		v1.GET("/analytics", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleSuperAdmin, commonauth.RoleManager, commonauth.RoleModerator), func(c *gin.Context) { searchAnalytics(c, database) })
		v1.GET("/synonyms", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) { listSynonyms(c, database) })
		v1.POST("/synonyms", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) { upsertSynonym(c, database) })
		v1.DELETE("/synonyms/:term", middleware.JWT(tokenMgr, false), middleware.RequireRoles(commonauth.RoleTenantAdmin, commonauth.RoleManager), func(c *gin.Context) { deleteSynonym(c, database) })
	}

	log.Printf("search-service on :%s", cfg.HTTPPort)
	log.Fatal(r.Run(":" + cfg.HTTPPort))
}

func ensureIndex(esURL string) error {
	mapping := `{
	  "settings": {
	    "analysis": {
	      "analyzer": {
	        "uz_analyzer": {"tokenizer": "standard", "filter": ["lowercase", "asciifolding"]},
	        "ru_analyzer": {"type": "russian"}
	      }
	    }
	  },
	  "mappings": {
	    "properties": {
	      "id": {"type": "keyword"},
	      "tenant_id": {"type": "keyword"},
	      "slug": {"type": "keyword"},
	      "vendor_id": {"type": "keyword"},
	      "category_id": {"type": "keyword"},
	      "price": {"type": "double"},
	      "compare_at_price": {"type": "double"},
	      "currency": {"type": "keyword"},
	      "status": {"type": "keyword"},
	      "is_featured": {"type": "boolean"},
	      "inventory_quantity": {"type": "integer"},
	      "rating": {"type": "float"},
	      "created_at": {"type": "date"},
	      "images": {"type": "keyword"},
	      "name_uz": {"type": "text", "analyzer": "uz_analyzer"},
	      "name_ru": {"type": "text", "analyzer": "ru_analyzer"},
	      "name_en": {"type": "text", "analyzer": "uz_analyzer"},
	      "name_ar": {"type": "text", "analyzer": "uz_analyzer"},
	      "description_uz": {"type": "text", "analyzer": "uz_analyzer"},
	      "description_ru": {"type": "text", "analyzer": "ru_analyzer"},
	      "suggest": {"type": "completion"}
	    }
	  }
	}`
	req, _ := http.NewRequest(http.MethodPut, esURL+"/products", strings.NewReader(mapping))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("es index ensure: %v", err)
		return err
	}
	defer resp.Body.Close()
	return nil
}

func consumeProducts(brokers []string, database *sqlx.DB, esURL string) {
	reader := kafkax.NewReader(brokers, "product.created", "search-indexer")
	reader2 := kafkax.NewReader(brokers, "product.updated", "search-indexer")
	reader3 := kafkax.NewReader(brokers, "product.deleted", "search-indexer")
	go drain(reader, database, esURL)
	go drain(reader2, database, esURL)
	go drainDelete(reader3, esURL)
}

func drain(reader *kafka.Reader, database *sqlx.DB, esURL string) {
	defer reader.Close()
	for {
		msg, err := reader.ReadMessage(context.Background())
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		var payload map[string]any
		_ = json.Unmarshal(msg.Value, &payload)
		id, _ := payload["id"].(string)
		if id != "" && database != nil {
			_ = indexProduct(database, esURL, id)
		}
	}
}

func drainDelete(reader *kafka.Reader, esURL string) {
	defer reader.Close()
	for {
		msg, err := reader.ReadMessage(context.Background())
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		var payload map[string]any
		_ = json.Unmarshal(msg.Value, &payload)
		id, _ := payload["id"].(string)
		if id == "" {
			continue
		}
		req, _ := http.NewRequest(http.MethodDelete, fmt.Sprintf("%s/products/_doc/%s", esURL, id), nil)
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			resp.Body.Close()
		}
	}
}

func indexProduct(database *sqlx.DB, esURL, id string) error {
	var row struct {
		ID                string          `db:"id"`
		TenantID          string          `db:"tenant_id"`
		VendorID          *string         `db:"vendor_id"`
		CategoryID        *string         `db:"category_id"`
		Slug              string          `db:"slug"`
		Translations      json.RawMessage `db:"translations"`
		Price             float64         `db:"price"`
		CompareAtPrice    *float64        `db:"compare_at_price"`
		Currency          string          `db:"currency"`
		Status            string          `db:"status"`
		IsFeatured        bool            `db:"is_featured"`
		InventoryQuantity int             `db:"inventory_quantity"`
		Images            json.RawMessage `db:"images"`
		Rating            *float64        `db:"rating"`
		CreatedAt         time.Time       `db:"created_at"`
	}
	if err := database.Get(&row, `SELECT id, tenant_id, vendor_id, category_id, slug, translations, price, compare_at_price, currency, status,
		COALESCE(is_featured,false) AS is_featured, COALESCE(inventory_quantity,0) AS inventory_quantity,
		COALESCE(images,'[]'::jsonb) AS images, rating, created_at
		FROM products WHERE id=$1`, id); err != nil {
		return err
	}
	var tr map[string]map[string]string
	_ = json.Unmarshal(row.Translations, &tr)
	var images []string
	_ = json.Unmarshal(row.Images, &images)
	if images == nil {
		images = []string{}
	}
	inputs := make([]string, 0, 4)
	for _, loc := range []string{"uz", "ru", "en", "ar"} {
		if n := strings.TrimSpace(tr[loc]["name"]); n != "" {
			inputs = append(inputs, n)
		}
	}
	doc := map[string]any{
		"id":                 row.ID,
		"tenant_id":          row.TenantID,
		"slug":               row.Slug,
		"vendor_id":          row.VendorID,
		"category_id":        row.CategoryID,
		"price":              row.Price,
		"compare_at_price":   row.CompareAtPrice,
		"currency":           row.Currency,
		"status":             row.Status,
		"is_featured":        row.IsFeatured,
		"inventory_quantity": row.InventoryQuantity,
		"images":             images,
		"translations":       tr,
		"rating":             row.Rating,
		"created_at":         row.CreatedAt.UTC().Format(time.RFC3339),
		"name_uz":            tr["uz"]["name"],
		"name_ru":            tr["ru"]["name"],
		"name_en":            tr["en"]["name"],
		"name_ar":            tr["ar"]["name"],
		"description_uz":     tr["uz"]["description"],
		"description_ru":     tr["ru"]["description"],
		"suggest":            map[string]any{"input": inputs},
	}
	body, _ := json.Marshal(doc)
	req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/products/_doc/%s", esURL, id), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func parsePageLimit(c *gin.Context) (page, limit, from int) {
	page = 1
	limit = 20
	if v, err := strconv.Atoi(c.DefaultQuery("page", "1")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(c.DefaultQuery("limit", "20")); err == nil && v > 0 {
		limit = v
		if limit > 48 {
			limit = 48
		}
	}
	from = (page - 1) * limit
	return page, limit, from
}

func hydrateProducts(database *sqlx.DB, ids []string) []map[string]any {
	if database == nil || len(ids) == 0 {
		return []map[string]any{}
	}
	query, args, err := sqlx.In(`SELECT id, slug, translations, price, compare_at_price, currency, images,
		inventory_quantity, vendor_id, category_id, is_featured, rating, created_at, status
		FROM products WHERE id IN (?) AND status='active'`, ids)
	if err != nil {
		return []map[string]any{}
	}
	query = database.Rebind(query)
	rows, err := database.Queryx(query, args...)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	byID := map[string]map[string]any{}
	for rows.Next() {
		m := map[string]any{}
		_ = rows.MapScan(m)
		id := asString(m["id"])
		if id == "" {
			continue
		}
		m["id"] = id
		byID[id] = normalizeProductRow(m)
	}
	out := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		if p, ok := byID[id]; ok {
			out = append(out, p)
		}
	}
	return out
}

func asString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case []byte:
		return string(t)
	default:
		return ""
	}
}

func normalizeProductRow(m map[string]any) map[string]any {
	for _, key := range []string{"id", "slug", "currency", "vendor_id", "category_id", "status"} {
		if b, ok := m[key].([]byte); ok {
			m[key] = string(b)
		}
	}
	if b, ok := m["translations"].([]byte); ok {
		var tr any
		if json.Unmarshal(b, &tr) == nil {
			m["translations"] = tr
		}
	}
	if b, ok := m["images"].([]byte); ok {
		var imgs any
		if json.Unmarshal(b, &imgs) == nil {
			m["images"] = imgs
		}
	}
	for _, key := range []string{"price", "compare_at_price", "rating"} {
		switch v := m[key].(type) {
		case []byte:
			var f float64
			if _, err := fmt.Sscan(string(v), &f); err == nil {
				m[key] = f
			}
		}
	}
	return m
}

func extractHitIDs(esResp map[string]any) []string {
	hitsWrap, _ := esResp["hits"].(map[string]any)
	arr, _ := hitsWrap["hits"].([]any)
	ids := make([]string, 0, len(arr))
	seen := map[string]struct{}{}
	for _, h := range arr {
		hm, _ := h.(map[string]any)
		id, _ := hm["_id"].(string)
		if id == "" {
			if src, ok := hm["_source"].(map[string]any); ok {
				id, _ = src["id"].(string)
			}
		}
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids
}

func search(c *gin.Context, database *sqlx.DB, esURL string) {
	q := strings.TrimSpace(c.Query("q"))
	locale := c.DefaultQuery("locale", "uz")
	sort := c.DefaultQuery("sort", "relevance")
	categoryID := c.Query("category_id")
	minPrice := c.Query("min_price")
	maxPrice := c.Query("max_price")
	onSale := c.Query("on_sale") == "true" || c.Query("on_sale") == "1"
	inStock := c.Query("in_stock") == "true" || c.Query("in_stock") == "1"
	featured := c.Query("featured") == "true" || c.Query("featured") == "1"
	page, limit, from := parsePageLimit(c)

	q = applySynonyms(database, middleware.GetTenantID(c), q)

	fields := []string{"name_uz^3", "name_ru^3", "name_en^2", "name_ar^2", "description_uz", "description_ru", "slug"}
	switch locale {
	case "ru":
		fields = []string{"name_ru^4", "name_uz^2", "name_en^2", "description_ru", "description_uz", "slug"}
	case "en":
		fields = []string{"name_en^4", "name_uz^2", "name_ru^2", "description_uz", "description_ru", "slug"}
	case "ar":
		fields = []string{"name_ar^4", "name_uz^2", "name_en^2", "description_uz", "slug"}
	}

	must := []any{
		map[string]any{"term": map[string]any{"tenant_id": middleware.GetTenantID(c)}},
		map[string]any{"term": map[string]any{"status": "active"}},
	}
	if categoryID != "" {
		must = append(must, map[string]any{"term": map[string]any{"category_id": categoryID}})
	}
	if featured {
		must = append(must, map[string]any{"term": map[string]any{"is_featured": true}})
	}
	if inStock {
		must = append(must, map[string]any{"range": map[string]any{"inventory_quantity": map[string]any{"gt": 0}}})
	}
	if onSale {
		must = append(must, map[string]any{"exists": map[string]any{"field": "compare_at_price"}})
		must = append(must, map[string]any{"script": map[string]any{"script": map[string]any{
			"source": "doc.containsKey('compare_at_price') && doc['compare_at_price'].size() != 0 && doc['compare_at_price'].value > doc['price'].value",
			"lang":   "painless",
		}}})
	}
	if minPrice != "" || maxPrice != "" {
		rng := map[string]any{}
		if minPrice != "" {
			if v, err := strconv.ParseFloat(minPrice, 64); err == nil {
				rng["gte"] = v
			}
		}
		if maxPrice != "" {
			if v, err := strconv.ParseFloat(maxPrice, 64); err == nil {
				rng["lte"] = v
			}
		}
		if len(rng) > 0 {
			must = append(must, map[string]any{"range": map[string]any{"price": rng}})
		}
	}
	if q != "" {
		must = append(must, map[string]any{"multi_match": map[string]any{
			"query":     q,
			"fields":    fields,
			"fuzziness": "AUTO",
			"operator":  "and",
			"type":      "best_fields",
		}})
	}

	esQuery := map[string]any{
		"from": from,
		"size": limit,
		"query": map[string]any{
			"bool": map[string]any{"must": must},
		},
	}
	if sort == "price_asc" {
		esQuery["sort"] = []any{map[string]any{"price": "asc"}}
	} else if sort == "price_desc" {
		esQuery["sort"] = []any{map[string]any{"price": "desc"}}
	} else if sort == "newest" {
		esQuery["sort"] = []any{map[string]any{"created_at": "desc"}}
	}

	body, _ := json.Marshal(esQuery)
	resp, err := http.Post(esURL+"/products/_search", "application/json", bytes.NewReader(body))
	resultsCount := 0
	if err != nil || resp.StatusCode >= 300 {
		if resp != nil {
			resp.Body.Close()
		}
		fallbackSearch(c, database, q, locale, categoryID, minPrice, maxPrice, sort, page, limit, onSale, inStock, featured)
		return
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var esResp map[string]any
	_ = json.Unmarshal(raw, &esResp)
	if hits, ok := esResp["hits"].(map[string]any); ok {
		if total, ok := hits["total"].(map[string]any); ok {
			if v, ok := total["value"].(float64); ok {
				resultsCount = int(v)
			}
		} else if v, ok := hits["total"].(float64); ok {
			resultsCount = int(v)
		}
	}

	ids := extractHitIDs(esResp)
	// Only DB-hydrated active products — never fall back to raw ES _source
	// (index lag after archive/moderation would otherwise leak delisted items).
	items := hydrateProducts(database, ids)
	resultsCount = len(items)

	if database != nil && q != "" {
		_, _ = database.Exec(`INSERT INTO search_queries (tenant_id, query, locale, results_count) VALUES ($1,$2,$3,$4)`,
			middleware.GetTenantID(c), q, locale, resultsCount)
	}
	httpx.OK(c, gin.H{
		"query":         q,
		"locale":        locale,
		"page":          page,
		"limit":         limit,
		"results_count": resultsCount,
		"total":         resultsCount,
		"items":         items,
	})
}

func searchAnalytics(c *gin.Context, database *sqlx.DB) {
	type row struct {
		Query string `db:"query"`
		Cnt   int    `db:"cnt"`
	}
	var popular []row
	_ = database.Select(&popular, `SELECT query, COUNT(*) AS cnt FROM search_queries WHERE tenant_id=$1 GROUP BY query ORDER BY cnt DESC LIMIT 20`, middleware.GetTenantID(c))
	var zero []row
	_ = database.Select(&zero, `SELECT query, COUNT(*) AS cnt FROM search_queries WHERE tenant_id=$1 AND results_count=0 GROUP BY query ORDER BY cnt DESC LIMIT 20`, middleware.GetTenantID(c))
	httpx.OK(c, gin.H{"popular": popular, "zero_results": zero})
}

func popularSearches(c *gin.Context, database *sqlx.DB) {
	type row struct {
		Query string `db:"query" json:"query"`
		Cnt   int    `db:"cnt" json:"count"`
	}
	var popular []row
	if database != nil {
		_ = database.Select(&popular, `
			SELECT query, COUNT(*)::int AS cnt
			FROM search_queries
			WHERE tenant_id=$1 AND results_count > 0 AND char_length(trim(query)) >= 2
			GROUP BY query
			ORDER BY cnt DESC
			LIMIT 10`, middleware.GetTenantID(c))
	}
	if popular == nil {
		popular = []row{}
	}
	httpx.OK(c, gin.H{"items": popular})
}

func fallbackSearch(c *gin.Context, database *sqlx.DB, q, locale, categoryID, minPrice, maxPrice, sort string, page, limit int, onSale, inStock, featured bool) {
	if database == nil {
		httpx.OK(c, gin.H{"items": []any{}, "total": 0, "results_count": 0, "fallback": true})
		return
	}
	args := []any{middleware.GetTenantID(c)}
	where := `tenant_id=$1 AND status='active'`
	if q != "" {
		args = append(args, "%"+q+"%")
		where += fmt.Sprintf(` AND (translations::text ILIKE $%d OR slug ILIKE $%d)`, len(args), len(args))
	}
	if categoryID != "" {
		args = append(args, categoryID)
		where += fmt.Sprintf(` AND category_id=$%d`, len(args))
	}
	if featured {
		where += ` AND is_featured=true`
	}
	if onSale {
		where += ` AND compare_at_price IS NOT NULL AND compare_at_price > price`
	}
	if inStock {
		where += ` AND inventory_quantity > 0`
	}
	if minPrice != "" {
		if v, err := strconv.ParseFloat(minPrice, 64); err == nil {
			args = append(args, v)
			where += fmt.Sprintf(` AND price >= $%d`, len(args))
		}
	}
	if maxPrice != "" {
		if v, err := strconv.ParseFloat(maxPrice, 64); err == nil {
			args = append(args, v)
			where += fmt.Sprintf(` AND price <= $%d`, len(args))
		}
	}
	order := `created_at DESC`
	switch sort {
	case "price_asc":
		order = `price ASC`
	case "price_desc":
		order = `price DESC`
	case "newest":
		order = `created_at DESC`
	}

	var total int
	_ = database.Get(&total, `SELECT COUNT(*) FROM products WHERE `+where, args...)

	offset := (page - 1) * limit
	args = append(args, limit, offset)
	listQ := fmt.Sprintf(`SELECT id, slug, translations, price, compare_at_price, currency, images,
		inventory_quantity, vendor_id, category_id, is_featured, rating, created_at, status
		FROM products WHERE %s ORDER BY %s LIMIT $%d OFFSET $%d`, where, order, len(args)-1, len(args))
	rows, err := database.Queryx(listQ, args...)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		m := map[string]any{}
		_ = rows.MapScan(m)
		items = append(items, normalizeProductRow(m))
	}
	if q != "" {
		_, _ = database.Exec(`INSERT INTO search_queries (tenant_id, query, locale, results_count) VALUES ($1,$2,$3,$4)`,
			middleware.GetTenantID(c), q, locale, total)
	}
	httpx.OK(c, gin.H{"items": items, "total": total, "results_count": total, "fallback": true, "page": page, "limit": limit})
}

func suggest(c *gin.Context, database *sqlx.DB, esURL string) {
	q := strings.TrimSpace(c.Query("q"))
	locale := c.DefaultQuery("locale", "uz")
	start := time.Now()
	if q == "" {
		httpx.OK(c, gin.H{"suggestions": []string{}, "products": []any{}, "took_ms": 0})
		return
	}

	suggestions := []string{}
	body := fmt.Sprintf(`{"suggest":{"product-suggest":{"prefix":%q,"completion":{"field":"suggest","fuzzy":{"fuzziness":2},"size":8,"skip_duplicates":true}}}}`, q)
	resp, err := http.Post(esURL+"/products/_search", "application/json", strings.NewReader(body))
	if err == nil {
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		var esResp map[string]any
		_ = json.Unmarshal(raw, &esResp)
		if sug, ok := esResp["suggest"].(map[string]any); ok {
			if arr, ok := sug["product-suggest"].([]any); ok {
				for _, block := range arr {
					bm, _ := block.(map[string]any)
					opts, _ := bm["options"].([]any)
					for _, opt := range opts {
						om, _ := opt.(map[string]any)
						if text, ok := om["text"].(string); ok && text != "" {
							suggestions = append(suggestions, text)
						}
					}
				}
			}
		}
	}

	namePath := "uz"
	if locale == "ru" || locale == "en" || locale == "ar" {
		namePath = locale
	}

	if len(suggestions) == 0 && database != nil {
		rows, qerr := database.Queryx(
			fmt.Sprintf(`SELECT COALESCE(translations->'%s'->>'name', translations->'uz'->>'name') AS name
				FROM products
				WHERE tenant_id=$1 AND status='active'
				  AND (translations::text ILIKE $2 OR slug ILIKE $2)
				LIMIT 8`, namePath),
			middleware.GetTenantID(c), "%"+q+"%",
		)
		if qerr == nil {
			defer rows.Close()
			for rows.Next() {
				var name *string
				_ = rows.Scan(&name)
				if name != nil && *name != "" {
					suggestions = append(suggestions, *name)
				}
			}
		}
	}

	seen := map[string]struct{}{}
	uniq := make([]string, 0, len(suggestions))
	for _, s := range suggestions {
		k := strings.ToLower(strings.TrimSpace(s))
		if k == "" {
			continue
		}
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		uniq = append(uniq, s)
		if len(uniq) >= 8 {
			break
		}
	}

	products := []map[string]any{}
	if database != nil {
		rows, qerr := database.Queryx(
			fmt.Sprintf(`SELECT id, slug, translations, price, compare_at_price, currency, images
				FROM products
				WHERE tenant_id=$1 AND status='active'
				  AND (translations::text ILIKE $2 OR slug ILIKE $2)
				ORDER BY CASE WHEN lower(COALESCE(translations->'%s'->>'name','')) LIKE lower($3) THEN 0 ELSE 1 END, created_at DESC
				LIMIT 4`, namePath),
			middleware.GetTenantID(c), "%"+q+"%", q+"%",
		)
		if qerr == nil {
			defer rows.Close()
			for rows.Next() {
				m := map[string]any{}
				_ = rows.MapScan(m)
				products = append(products, normalizeProductRow(m))
			}
		}
	}

	httpx.OK(c, gin.H{"suggestions": uniq, "products": products, "took_ms": time.Since(start).Milliseconds()})
}

func facets(c *gin.Context, database *sqlx.DB) {
	type facet struct {
		CategoryID string `db:"category_id" json:"category_id"`
		Count      int    `db:"count" json:"count"`
	}
	var items []facet
	_ = database.Select(&items, `SELECT category_id::text AS category_id, COUNT(*)::int AS count FROM products WHERE tenant_id=$1 AND status='active' AND category_id IS NOT NULL GROUP BY category_id`, middleware.GetTenantID(c))

	ranges := []gin.H{
		{"min": 0, "max": 100000},
		{"min": 100000, "max": 500000},
		{"min": 500000, "max": 2000000},
		{"min": 2000000, "max": 10000000},
	}
	if database != nil {
		var stats struct {
			MinPrice float64 `db:"min_price"`
			MaxPrice float64 `db:"max_price"`
		}
		err := database.Get(&stats, `SELECT COALESCE(MIN(price),0) AS min_price, COALESCE(MAX(price),0) AS max_price FROM products WHERE tenant_id=$1 AND status='active'`, middleware.GetTenantID(c))
		if err == nil && stats.MaxPrice > 0 {
			top := stats.MaxPrice
			if top < 500000 {
				ranges = []gin.H{
					{"min": 0, "max": 100000},
					{"min": 100000, "max": 300000},
					{"min": 300000, "max": int(top) + 1},
				}
			} else if top < 3000000 {
				ranges = []gin.H{
					{"min": 0, "max": 200000},
					{"min": 200000, "max": 800000},
					{"min": 800000, "max": 2000000},
					{"min": 2000000, "max": int(top) + 1},
				}
			}
		}
	}

	httpx.OK(c, gin.H{"categories": items, "price_ranges": ranges})
}

func reindex(c *gin.Context, database *sqlx.DB, esURL string) {
	var ids []string
	_ = database.Select(&ids, `SELECT id FROM products WHERE tenant_id=$1`, middleware.GetTenantID(c))
	n := 0
	for _, id := range ids {
		if err := indexProduct(database, esURL, id); err == nil {
			n++
		}
	}
	httpx.OK(c, gin.H{"indexed": n})
}

func applySynonyms(database *sqlx.DB, tenantID, q string) string {
	lower := strings.ToLower(strings.TrimSpace(q))
	defaults := map[string]string{"телефон": "telefon", "smartphone": "telefon", "одежда": "kiyim"}
	if syn, ok := defaults[lower]; ok {
		return syn
	}
	if database == nil {
		return q
	}
	var canonical string
	err := database.Get(&canonical, `
		SELECT term FROM search_synonyms
		WHERE tenant_id=$1 AND (LOWER(term)=$2 OR $2 = ANY(SELECT LOWER(unnest(synonyms))))
		LIMIT 1`, tenantID, lower)
	if err == nil && canonical != "" {
		return canonical
	}
	return q
}

func listSynonyms(c *gin.Context, database *sqlx.DB) {
	out := map[string][]string{
		"telefon": {"smartphone", "mobil", "телефон"},
		"kiyim":   {"одежда", "clothing"},
	}
	if database != nil {
		var terms []string
		_ = database.Select(&terms, `SELECT term FROM search_synonyms WHERE tenant_id=$1`, middleware.GetTenantID(c))
		for _, term := range terms {
			var syns []string
			_ = database.Select(&syns, `SELECT unnest(synonyms) FROM search_synonyms WHERE tenant_id=$1 AND term=$2`, middleware.GetTenantID(c), term)
			if len(syns) > 0 {
				out[term] = syns
			}
		}
	}
	httpx.OK(c, gin.H{"synonyms": out})
}

func upsertSynonym(c *gin.Context, database *sqlx.DB) {
	var body struct {
		Term     string   `json:"term" binding:"required"`
		Synonyms []string `json:"synonyms" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	joined := strings.Join(body.Synonyms, ",")
	_, err := database.Exec(`
		INSERT INTO search_synonyms (id, tenant_id, term, synonyms)
		VALUES ($1,$2,$3, string_to_array($4, ','))
		ON CONFLICT (tenant_id, term) DO UPDATE SET synonyms = string_to_array($4, ',')`,
		uuid.NewString(), middleware.GetTenantID(c), strings.ToLower(body.Term), joined)
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	httpx.OK(c, gin.H{"term": body.Term, "synonyms": body.Synonyms})
}

func deleteSynonym(c *gin.Context, database *sqlx.DB) {
	_, err := database.Exec(`DELETE FROM search_synonyms WHERE tenant_id=$1 AND term=$2`, middleware.GetTenantID(c), strings.ToLower(c.Param("term")))
	if err != nil {
		httpx.BadRequest(c, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}
