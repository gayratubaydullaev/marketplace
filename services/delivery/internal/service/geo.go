package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	nominatimBase    = "https://nominatim.openstreetmap.org"
	yandexGeocodeURL = "https://geocode-maps.yandex.ru/1.x/"
	geoUserAgent     = "GayratMarketplace/1.0 (delivery-geo-proxy)"
	geoCacheTTL      = 30 * 24 * time.Hour
	geoHTTPTimeout   = 5 * time.Second
	uzViewbox        = "55.9,45.6,73.2,37.1" // Uzbekistan approx (left,top,right,bottom)
	minIntervalPerIP = time.Second
)

type GeoResult struct {
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	DisplayName string  `json:"display_name"`
	Label       string  `json:"label,omitempty"`
	Source      string  `json:"source,omitempty"` // nominatim|yandex|local
}

type rateGate struct {
	mu   sync.Mutex
	last map[string]time.Time
}

func newRateGate() *rateGate {
	return &rateGate{last: map[string]time.Time{}}
}

func (g *rateGate) allow(key string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := time.Now()
	if t, ok := g.last[key]; ok && now.Sub(t) < minIntervalPerIP {
		return false
	}
	g.last[key] = now
	if len(g.last) > 5000 {
		g.last = map[string]time.Time{key: now}
	}
	return true
}

var geoRate = newRateGate()

var apostropheRe = regexp.MustCompile(`[’‘ʻʼ'\x60]`)

// Streets / houses missing in OSM but known in Yandex — exact pins for UZ delivery.
// Match tokens are lowercased Latin/Cyrillic without apostrophes; all Must tokens required,
// AnyOf is optional group (at least one if non-empty).
type localPlace struct {
	Must  []string
	Lat   float64
	Lng   float64
	Label string
}

var localPlaces = []localPlace{
	{
		Must:  []string{"gargali", "94"},
		Lat:   39.728101,
		Lng:   67.176565,
		Label: "улица Гаргали, 94, Джамбайский район, Самаркандская область",
	},
	{
		Must:  []string{"гаргали", "94"},
		Lat:   39.728101,
		Lng:   67.176565,
		Label: "улица Гаргали, 94, Джамбайский район, Самаркандская область",
	},
}

// Latin ↔ Cyrillic place aliases for UZ geocoding (Yandex prefers Russian forms).
var placeAliases = map[string]string{
	"gargali":   "Гаргали",
	"g'argali":  "Гаргали",
	"jomboy":    "Джамбай",
	"djambay":   "Джамбай",
	"jambay":    "Джамбай",
	"samarqand": "Самарканд",
	"samarkand": "Самарканд",
	"toshkent":  "Ташкент",
	"tashkent":  "Ташкент",
}

func hashQuery(kind, q string) string {
	sum := sha256.Sum256([]byte(kind + "|" + strings.ToLower(strings.TrimSpace(q))))
	return hex.EncodeToString(sum[:])
}

func normalizeGeoQuery(q string) string {
	q = strings.TrimSpace(q)
	q = apostropheRe.ReplaceAllString(q, "")
	q = strings.Join(strings.Fields(q), " ")
	return q
}

func normKey(q string) string {
	return strings.ToLower(normalizeGeoQuery(q))
}

func matchLocalPlaces(q string) []GeoResult {
	nq := normKey(q)
	var out []GeoResult
	for _, p := range localPlaces {
		ok := true
		for _, m := range p.Must {
			if !strings.Contains(nq, strings.ToLower(m)) {
				ok = false
				break
			}
		}
		if !ok {
			continue
		}
		out = append(out, GeoResult{
			Lat: p.Lat, Lng: p.Lng,
			DisplayName: p.Label, Label: p.Label, Source: "local",
		})
	}
	return out
}

func searchVariants(q string) []string {
	q = normalizeGeoQuery(q)
	if q == "" {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, 8)
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		key := strings.ToLower(s)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, s)
	}
	add(q)
	add(q + ", Uzbekistan")
	add(toYandexQuery(q))

	parts := strings.Fields(q)
	if len(parts) >= 2 {
		last := parts[len(parts)-1]
		if _, err := strconv.Atoi(last); err == nil {
			add(strings.Join(parts[:len(parts)-1], " ") + ", Uzbekistan")
		}
	}
	if len(parts) >= 3 {
		add(parts[0] + ", " + parts[len(parts)-1] + ", Uzbekistan")
	}
	return out
}

// toYandexQuery builds a Russian-style address Yandex understands better.
func toYandexQuery(q string) string {
	q = normalizeGeoQuery(q)
	lower := strings.ToLower(q)
	// Replace known Latin tokens with Cyrillic.
	for lat, cyr := range placeAliases {
		re := regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(strings.Trim(lat, "'")) + `\b`)
		lower = re.ReplaceAllString(lower, cyr)
	}
	// Restore original casing mix by rebuilding from tokens
	parts := strings.Fields(q)
	out := make([]string, 0, len(parts)+3)
	hasStreetWord := false
	for _, p := range parts {
		pl := strings.ToLower(apostropheRe.ReplaceAllString(p, ""))
		if alias, ok := placeAliases[pl]; ok {
			out = append(out, alias)
			continue
		}
		out = append(out, p)
	}
	joined := strings.Join(out, " ")
	jl := strings.ToLower(joined)
	if strings.Contains(jl, "улица") || strings.Contains(jl, "ko'cha") || strings.Contains(jl, "kocha") {
		hasStreetWord = true
	}
	// If first token looks like a street name and next is a house number, prefix "улица".
	if !hasStreetWord && len(parts) >= 2 {
		if _, err := strconv.Atoi(apostropheRe.ReplaceAllString(parts[1], "")); err == nil {
			joined = "улица " + joined
		}
	}
	// Add district/region hints when present in Latin form already replaced.
	if strings.Contains(strings.ToLower(joined), "джамбай") && !strings.Contains(strings.ToLower(joined), "район") {
		joined += ", Джамбайский район"
	}
	if strings.Contains(strings.ToLower(joined), "самарканд") && !strings.Contains(strings.ToLower(joined), "область") {
		joined += ", Самаркандская область"
	}
	return joined
}

func (s *Service) yandexAPIKey() string {
	if s.YandexGeocoderKey != "" {
		return s.YandexGeocoderKey
	}
	return os.Getenv("YANDEX_GEOCODER_API_KEY")
}

func (s *Service) geoClient() *http.Client {
	if s.HTTP != nil {
		c := *s.HTTP
		c.Timeout = geoHTTPTimeout
		return &c
	}
	return &http.Client{Timeout: geoHTTPTimeout}
}

func (s *Service) cacheGetDB(hash, kind string) (json.RawMessage, bool) {
	if s.DB == nil {
		return nil, false
	}
	type row struct {
		Result    []byte    `db:"result"`
		CreatedAt time.Time `db:"created_at"`
	}
	var r row
	if err := s.DB.Get(&r, `SELECT result, created_at FROM geo_cache WHERE query_hash=$1 AND kind=$2`, hash, kind); err != nil {
		return nil, false
	}
	if time.Since(r.CreatedAt) > geoCacheTTL {
		return nil, false
	}
	return json.RawMessage(r.Result), true
}

func (s *Service) cachePut(hash, kind string, result any) {
	if s.DB == nil {
		return
	}
	b, err := json.Marshal(result)
	if err != nil {
		return
	}
	// Never cache empty search results — providers differ and we may improve later.
	if kind == "search" {
		var arr []GeoResult
		if json.Unmarshal(b, &arr) == nil && len(arr) == 0 {
			return
		}
	}
	_, _ = s.DB.Exec(`
		INSERT INTO geo_cache (query_hash, kind, result)
		VALUES ($1,$2,$3)
		ON CONFLICT (query_hash, kind) DO UPDATE SET result=EXCLUDED.result, created_at=NOW()`,
		hash, kind, b)
}

func (s *Service) nominatimSearch(ctx context.Context, q string, limit int, allowUpstream bool) ([]GeoResult, error) {
	hash := hashQuery("search", "nom|"+q+"|"+strconv.Itoa(limit))
	if cached, ok := s.cacheGetDB(hash, "search"); ok {
		var out []GeoResult
		if json.Unmarshal(cached, &out) == nil && len(out) > 0 {
			return out, nil
		}
	}
	if !allowUpstream {
		return nil, nil
	}

	u, _ := url.Parse(nominatimBase + "/search")
	qs := u.Query()
	qs.Set("q", q)
	qs.Set("format", "json")
	qs.Set("limit", strconv.Itoa(limit))
	qs.Set("countrycodes", "uz")
	qs.Set("viewbox", uzViewbox)
	qs.Set("bounded", "0")
	qs.Set("addressdetails", "0")
	u.RawQuery = qs.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", geoUserAgent)
	req.Header.Set("Accept", "application/json")
	res, err := s.geoClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("%w: geocoder %s", ErrBadRequest, res.Status)
	}
	var raw []struct {
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
		DisplayName string `json:"display_name"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]GeoResult, 0, len(raw))
	for _, r := range raw {
		lat, err1 := strconv.ParseFloat(r.Lat, 64)
		lng, err2 := strconv.ParseFloat(r.Lon, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		out = append(out, GeoResult{Lat: lat, Lng: lng, DisplayName: r.DisplayName, Label: r.DisplayName, Source: "nominatim"})
	}
	s.cachePut(hash, "search", out)
	return out, nil
}

func (s *Service) yandexSearch(ctx context.Context, q string, limit int) ([]GeoResult, error) {
	key := s.yandexAPIKey()
	if key == "" {
		return nil, nil
	}
	hash := hashQuery("search", "ya|"+q+"|"+strconv.Itoa(limit))
	if cached, ok := s.cacheGetDB(hash, "search"); ok {
		var out []GeoResult
		if json.Unmarshal(cached, &out) == nil && len(out) > 0 {
			return out, nil
		}
	}

	u, _ := url.Parse(yandexGeocodeURL)
	qs := u.Query()
	qs.Set("apikey", key)
	qs.Set("geocode", q)
	qs.Set("format", "json")
	qs.Set("results", strconv.Itoa(limit))
	qs.Set("lang", "ru_RU")
	qs.Set("bbox", "55.9,37.1~73.2,45.6") // Uzbekistan approx
	qs.Set("rspn", "0")
	u.RawQuery = qs.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", geoUserAgent)
	res, err := s.geoClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("%w: yandex geocoder %s", ErrBadRequest, res.Status)
	}

	var raw struct {
		Response struct {
			GeoObjectCollection struct {
				FeatureMember []struct {
					GeoObject struct {
						Name        string `json:"name"`
						Description string `json:"description"`
						Point       struct {
							Pos string `json:"pos"`
						} `json:"Point"`
					} `json:"GeoObject"`
				} `json:"featureMember"`
			} `json:"GeoObjectCollection"`
		} `json:"response"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	out := make([]GeoResult, 0, limit)
	for _, fm := range raw.Response.GeoObjectCollection.FeatureMember {
		g := fm.GeoObject
		parts := strings.Fields(g.Point.Pos)
		if len(parts) != 2 {
			continue
		}
		lng, err1 := strconv.ParseFloat(parts[0], 64)
		lat, err2 := strconv.ParseFloat(parts[1], 64)
		if err1 != nil || err2 != nil {
			continue
		}
		label := g.Name
		if g.Description != "" {
			label = g.Name + ", " + g.Description
		}
		out = append(out, GeoResult{Lat: lat, Lng: lng, DisplayName: label, Label: label, Source: "yandex"})
	}
	s.cachePut(hash, "search", out)
	return out, nil
}

func (s *Service) GeoSearch(ctx context.Context, clientIP, q string, limit int) ([]GeoResult, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return nil, fmt.Errorf("%w: q required", ErrBadRequest)
	}
	if limit <= 0 || limit > 10 {
		limit = 5
	}

	merged := make([]GeoResult, 0, limit)
	seen := map[string]struct{}{}
	addAll := func(items []GeoResult) {
		for _, it := range items {
			key := fmt.Sprintf("%.5f,%.5f", it.Lat, it.Lng)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			merged = append(merged, it)
		}
	}

	// 0) Local overrides for streets OSM lacks (e.g. Гаргали in Jomboy).
	addAll(matchLocalPlaces(q))
	if len(merged) > 0 {
		if len(merged) > limit {
			return merged[:limit], nil
		}
		return merged, nil
	}

	variants := searchVariants(q)

	// 1) Nominatim cache hits.
	for _, v := range variants {
		items, err := s.nominatimSearch(ctx, v, limit, false)
		if err != nil {
			return nil, err
		}
		if len(items) > 0 {
			addAll(items)
			return trimGeo(merged, limit), nil
		}
	}

	// 2) One Nominatim upstream call.
	if !geoRate.allow("s:" + clientIP) {
		return nil, fmt.Errorf("%w: rate limit", ErrBadRequest)
	}
	primary := variants[0]
	if !strings.Contains(strings.ToLower(primary), "uzbekistan") && !strings.Contains(primary, "область") {
		primary = primary + ", Uzbekistan"
	}
	items, err := s.nominatimSearch(ctx, primary, limit, true)
	if err != nil {
		return nil, err
	}
	addAll(items)
	if len(merged) > 0 {
		return trimGeo(merged, limit), nil
	}

	// 3) Yandex Geocoder fallback (much better UZ street coverage).
	yaQuery := toYandexQuery(q)
	yaItems, yaErr := s.yandexSearch(ctx, yaQuery, limit)
	if yaErr == nil {
		addAll(yaItems)
	}
	if len(merged) == 0 && yaQuery != q {
		yaItems2, _ := s.yandexSearch(ctx, q+", Узбекистан", limit)
		addAll(yaItems2)
	}

	return trimGeo(merged, limit), nil
}

func trimGeo(items []GeoResult, limit int) []GeoResult {
	if len(items) > limit {
		return items[:limit]
	}
	return items
}

func (s *Service) GeoReverse(ctx context.Context, clientIP string, lat, lng float64) (*GeoResult, error) {
	key := fmt.Sprintf("%.5f,%.5f", lat, lng)
	hash := hashQuery("reverse", key)
	if cached, ok := s.cacheGetDB(hash, "reverse"); ok {
		var out GeoResult
		if json.Unmarshal(cached, &out) == nil {
			return &out, nil
		}
	}
	if !geoRate.allow("r:" + clientIP) {
		return nil, fmt.Errorf("%w: rate limit", ErrBadRequest)
	}

	// Prefer Yandex reverse when configured (better UZ labels).
	if key := s.yandexAPIKey(); key != "" {
		u, _ := url.Parse(yandexGeocodeURL)
		qs := u.Query()
		qs.Set("apikey", key)
		qs.Set("geocode", fmt.Sprintf("%f,%f", lng, lat))
		qs.Set("format", "json")
		qs.Set("results", "1")
		qs.Set("lang", "ru_RU")
		u.RawQuery = qs.Encode()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err == nil {
			req.Header.Set("User-Agent", geoUserAgent)
			if res, err := s.geoClient().Do(req); err == nil {
				defer res.Body.Close()
				body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
				var raw struct {
					Response struct {
						GeoObjectCollection struct {
							FeatureMember []struct {
								GeoObject struct {
									Name        string `json:"name"`
									Description string `json:"description"`
									Point       struct {
										Pos string `json:"pos"`
									} `json:"Point"`
								} `json:"GeoObject"`
							} `json:"featureMember"`
						} `json:"GeoObjectCollection"`
					} `json:"response"`
				}
				if json.Unmarshal(body, &raw) == nil && len(raw.Response.GeoObjectCollection.FeatureMember) > 0 {
					g := raw.Response.GeoObjectCollection.FeatureMember[0].GeoObject
					label := g.Name
					if g.Description != "" {
						label = g.Name + ", " + g.Description
					}
					out := &GeoResult{Lat: lat, Lng: lng, DisplayName: label, Label: label, Source: "yandex"}
					s.cachePut(hash, "reverse", out)
					return out, nil
				}
			}
		}
	}

	u, _ := url.Parse(nominatimBase + "/reverse")
	qs := u.Query()
	qs.Set("lat", strconv.FormatFloat(lat, 'f', 7, 64))
	qs.Set("lon", strconv.FormatFloat(lng, 'f', 7, 64))
	qs.Set("format", "json")
	u.RawQuery = qs.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", geoUserAgent)
	req.Header.Set("Accept", "application/json")
	res, err := s.geoClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("%w: geocoder %s", ErrBadRequest, res.Status)
	}
	var raw struct {
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
		DisplayName string `json:"display_name"`
		Error       string `json:"error"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	if raw.Error != "" {
		return nil, fmt.Errorf("%w: %s", ErrBadRequest, raw.Error)
	}
	plat, err1 := strconv.ParseFloat(raw.Lat, 64)
	plng, err2 := strconv.ParseFloat(raw.Lon, 64)
	if err1 != nil || err2 != nil {
		plat, plng = lat, lng
	}
	out := &GeoResult{Lat: plat, Lng: plng, DisplayName: raw.DisplayName, Label: raw.DisplayName, Source: "nominatim"}
	s.cachePut(hash, "reverse", out)
	return out, nil
}

// GeocodeAddress is used server-side (ReadyForDelivery) — uses a shared rate key and DB cache.
func (s *Service) GeocodeAddress(ctx context.Context, address string) (lat, lng *float64, err error) {
	address = strings.TrimSpace(address)
	if address == "" {
		return nil, nil, nil
	}
	items, err := s.GeoSearch(ctx, "internal", address+", Uzbekistan", 1)
	if err != nil || len(items) == 0 {
		return nil, nil, err
	}
	la, lo := items[0].Lat, items[0].Lng
	return &la, &lo, nil
}

func asFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f, err == nil
	default:
		return 0, false
	}
}
