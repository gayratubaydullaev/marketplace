package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"sort"
	"strings"
)

var routes = []struct {
	prefix string
	target string
}{
	{"/v1/admin/users", "http://127.0.0.1:8001"},
	{"/v1/admin/reviews", "http://127.0.0.1:8008"},
	{"/v1/admin/returns", "http://127.0.0.1:8005"},
	{"/v1/admin/coupons", "http://127.0.0.1:8002"},
	{"/v1/admin/gift-certificates", "http://127.0.0.1:8002"},
	{"/v1/admin/hero-banners", "http://127.0.0.1:8002"},
	{"/v1/admin/products", "http://127.0.0.1:8002"},
	{"/v1/auth", "http://127.0.0.1:8001"},
	{"/.well-known/jwks.json", "http://127.0.0.1:8001"},
	{"/v1/products", "http://127.0.0.1:8002"},
	{"/v1/categories", "http://127.0.0.1:8002"},
	{"/v1/home", "http://127.0.0.1:8002"},
	{"/v1/sitemap.xml", "http://127.0.0.1:8002"},
	{"/v1/search", "http://127.0.0.1:8003"},
	{"/v1/cart", "http://127.0.0.1:8004"},
	{"/v1/addresses", "http://127.0.0.1:8004"},
	{"/v1/wishlist", "http://127.0.0.1:8004"},
	{"/v1/orders", "http://127.0.0.1:8005"},
	{"/v1/payments", "http://127.0.0.1:8006"},
	{"/v1/vendors", "http://127.0.0.1:8007"},
	{"/v1/vendor", "http://127.0.0.1:8007"},
	{"/v1/tenant", "http://127.0.0.1:8007"},
	{"/v1/admin", "http://127.0.0.1:8007"},
	{"/v1/reviews", "http://127.0.0.1:8008"},
	{"/v1/notifications", "http://127.0.0.1:8009"},
	{"/v1/analytics", "http://127.0.0.1:8010"},
	{"/v1/media", "http://127.0.0.1:8011"},
	{"/v1/realtime", "http://127.0.0.1:8012"},
}

func resolveTarget(path string) string {
	// Product review subpaths live on the reviews service, not catalog.
	if strings.HasPrefix(path, "/v1/products/") && strings.Contains(path, "/reviews") {
		return "http://127.0.0.1:8008"
	}

	type hit struct {
		prefix, target string
	}
	var matches []hit
	for _, rt := range routes {
		if strings.HasPrefix(path, rt.prefix) {
			matches = append(matches, hit{rt.prefix, rt.target})
		}
	}
	if len(matches) == 0 {
		return ""
	}
	sort.Slice(matches, func(i, j int) bool {
		return len(matches[i].prefix) > len(matches[j].prefix)
	})
	return matches[0].target
}

func stripUpstreamCORS(h http.Header) {
	for _, key := range []string{
		"Access-Control-Allow-Origin",
		"Access-Control-Allow-Methods",
		"Access-Control-Allow-Headers",
		"Access-Control-Allow-Credentials",
		"Access-Control-Expose-Headers",
		"Access-Control-Max-Age",
	} {
		h.Del(key)
	}
}

func writeCORS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	} else {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Add("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Tenant-ID, X-Locale, X-Guest-ID, X-Request-ID, X-Correlation-ID, Idempotency-Key")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
}

func main() {
	port := os.Getenv("GATEWAY_PORT")
	if port == "" {
		port = "8080"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeCORS(w, r)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","gateway":"dev"}`))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeCORS(w, r)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		target := resolveTarget(r.URL.Path)
		if target == "" {
			http.Error(w, `{"error":"no route"}`, http.StatusBadGateway)
			return
		}
		u, _ := url.Parse(target)
		proxy := httputil.NewSingleHostReverseProxy(u)
		proxy.ModifyResponse = func(resp *http.Response) error {
			// Gateway owns CORS — drop duplicates from Gin services.
			stripUpstreamCORS(resp.Header)
			return nil
		}
		if r.Header.Get("X-Request-ID") == "" {
			r.Header.Set("X-Request-ID", r.Header.Get("X-Correlation-ID"))
		}
		proxy.ServeHTTP(w, r)
	})
	log.Printf("dev gateway on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
