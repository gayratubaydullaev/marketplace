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
	r.Use(gin.Recovery(), middleware.CORS(), middleware.Tenant(), middleware.TenantDB(database), middleware.Metrics(cfg.ServiceName))
	middleware.MountMetrics(r)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	v1 := r.Group("/v1/search")
	{
		v1.GET("", func(c *gin.Context) { search(c, database, esURL) })
		v1.GET("/suggest", func(c *gin.Context) { suggest(c, database, esURL) })
		v1.GET("/facets", func(c *gin.Context) { facets(c, database) })
		v1.POST("/reindex", func(c *gin.Context) { reindex(c, database, esURL) })
		v1.GET("/analytics", func(c *gin.Context) { searchAnalytics(c, database) })
		v1.GET("/synonyms", func(c *gin.Context) { listSynonyms(c, database) })
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
	      "tenant_id": {"type": "keyword"},
	      "slug": {"type": "keyword"},
	      "vendor_id": {"type": "keyword"},
	      "category_id": {"type": "keyword"},
	      "price": {"type": "double"},
	      "currency": {"type": "keyword"},
	      "status": {"type": "keyword"},
	      "rating": {"type": "float"},
	      "name_uz": {"type": "text", "analyzer": "uz_analyzer"},
	      "name_ru": {"type": "text", "analyzer": "ru_analyzer"},
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
	go drain(reader, database, esURL)
	go drain(reader2, database, esURL)
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

func indexProduct(database *sqlx.DB, esURL, id string) error {
	var row struct {
		ID           string          `db:"id"`
		TenantID     string          `db:"tenant_id"`
		VendorID     *string         `db:"vendor_id"`
		CategoryID   string          `db:"category_id"`
		Slug         string          `db:"slug"`
		Translations json.RawMessage `db:"translations"`
		Price        float64         `db:"price"`
		Currency     string          `db:"currency"`
		Status       string          `db:"status"`
	}
	if err := database.Get(&row, `SELECT id, tenant_id, vendor_id, category_id, slug, translations, price, currency, status FROM products WHERE id=$1`, id); err != nil {
		return err
	}
	var tr map[string]map[string]string
	_ = json.Unmarshal(row.Translations, &tr)
	doc := map[string]any{
		"tenant_id": row.TenantID, "slug": row.Slug, "vendor_id": row.VendorID, "category_id": row.CategoryID,
		"price": row.Price, "currency": row.Currency, "status": row.Status,
		"name_uz": tr["uz"]["name"], "name_ru": tr["ru"]["name"],
		"description_uz": tr["uz"]["description"], "description_ru": tr["ru"]["description"],
		"suggest": []string{tr["uz"]["name"], tr["ru"]["name"]},
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

func search(c *gin.Context, database *sqlx.DB, esURL string) {
	q := c.Query("q")
	locale := c.DefaultQuery("locale", "uz")
	sort := c.DefaultQuery("sort", "relevance")
	page := c.DefaultQuery("page", "1")
	limit := c.DefaultQuery("limit", "20")
	categoryID := c.Query("category_id")

	// Apply synonyms from DB + defaults
	q = applySynonyms(database, middleware.GetTenantID(c), q)

	field := "name_uz"
	if locale == "ru" {
		field = "name_ru"
	}
	must := []any{
		map[string]any{"term": map[string]any{"tenant_id": middleware.GetTenantID(c)}},
		map[string]any{"term": map[string]any{"status": "active"}},
	}
	if categoryID != "" {
		must = append(must, map[string]any{"term": map[string]any{"category_id": categoryID}})
	}
	esQuery := map[string]any{
		"query": map[string]any{
			"bool": map[string]any{
				"must": must,
				"should": []any{
					map[string]any{"multi_match": map[string]any{
						"query": q, "fields": []string{field, "name_uz", "name_ru", "description_uz", "description_ru"},
						"fuzziness": "AUTO",
					}},
				},
			},
		},
	}
	if sort == "price_asc" {
		esQuery["sort"] = []any{map[string]any{"price": "asc"}}
	} else if sort == "price_desc" {
		esQuery["sort"] = []any{map[string]any{"price": "desc"}}
	}
	body, _ := json.Marshal(esQuery)
	resp, err := http.Post(esURL+"/products/_search?from="+page+"&size="+limit, "application/json", bytes.NewReader(body))
	resultsCount := 0
	if err != nil {
		fallbackSearch(c, database, q)
		if database != nil {
			_, _ = database.Exec(`INSERT INTO search_queries (tenant_id, query, locale, results_count) VALUES ($1,$2,$3,$4)`,
				middleware.GetTenantID(c), q, locale, 0)
		}
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
		}
	}
	if database != nil && q != "" {
		_, _ = database.Exec(`INSERT INTO search_queries (tenant_id, query, locale, results_count) VALUES ($1,$2,$3,$4)`,
			middleware.GetTenantID(c), q, locale, resultsCount)
	}
	httpx.OK(c, gin.H{"query": q, "result": esResp, "locale": locale, "results_count": resultsCount})
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

func fallbackSearch(c *gin.Context, database *sqlx.DB, q string) {
	if database == nil {
		httpx.OK(c, gin.H{"items": []any{}, "fallback": true})
		return
	}
	rows, err := database.Queryx(`SELECT id, slug, translations, price, currency, images FROM products
		WHERE tenant_id=$1 AND status='active' AND translations::text ILIKE $2 LIMIT 20`, middleware.GetTenantID(c), "%"+q+"%")
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	defer rows.Close()
	var items []map[string]any
	for rows.Next() {
		m := map[string]any{}
		_ = rows.MapScan(m)
		items = append(items, m)
	}
	httpx.OK(c, gin.H{"items": items, "fallback": true})
}

func suggest(c *gin.Context, database *sqlx.DB, esURL string) {
	q := c.Query("q")
	start := time.Now()
	body := fmt.Sprintf(`{"suggest":{"product-suggest":{"prefix":%q,"completion":{"field":"suggest","fuzzy":{"fuzziness":2},"size":8}}}}`, q)
	resp, err := http.Post(esURL+"/products/_search", "application/json", strings.NewReader(body))
	if err != nil {
		rows, _ := database.Queryx(`SELECT translations->'uz'->>'name' AS name FROM products WHERE tenant_id=$1 AND status='active' AND translations::text ILIKE $2 LIMIT 8`, middleware.GetTenantID(c), "%"+q+"%")
		defer rows.Close()
		var suggestions []string
		for rows.Next() {
			var name *string
			_ = rows.Scan(&name)
			if name != nil {
				suggestions = append(suggestions, *name)
			}
		}
		httpx.OK(c, gin.H{"suggestions": suggestions, "took_ms": time.Since(start).Milliseconds()})
		return
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	httpx.OK(c, gin.H{"result": json.RawMessage(raw), "took_ms": time.Since(start).Milliseconds()})
}

func facets(c *gin.Context, database *sqlx.DB) {
	type facet struct {
		CategoryID string `db:"category_id" json:"category_id"`
		Count      int    `db:"count" json:"count"`
	}
	var items []facet
	_ = database.Select(&items, `SELECT category_id::text AS category_id, COUNT(*)::int AS count FROM products WHERE tenant_id=$1 AND status='active' AND category_id IS NOT NULL GROUP BY category_id`, middleware.GetTenantID(c))
	httpx.OK(c, gin.H{"categories": items, "price_ranges": []gin.H{
		{"min": 0, "max": 100000}, {"min": 100000, "max": 500000}, {"min": 500000, "max": 2000000},
	}})
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
