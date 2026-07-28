package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStatus(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Great product", "approved"},
		{"This is spam junk", "pending"},
		{"Visit http://evil.com", "pending"},
		{"Buy at www.scam.uz now", "pending"},
		{"Call +998 90 123 45 67", "pending"},
		{"!!!!!!", "pending"},
		{"ab", "pending"},
		{"aaaaaaa", "pending"},
		{"THIS IS ALL CAPS NOISE XX", "pending"},
		{"Нормальный отзыв о товаре", "approved"},
	}
	for _, tc := range cases {
		if got := Status(tc.in); got != tc.want {
			t.Fatalf("%q: got %s want %s", tc.in, got, tc.want)
		}
	}
}

func TestStatusRemoteToxicity(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"toxic": true})
	}))
	defer srv.Close()
	t.Setenv("TOXICITY_API_URL", srv.URL)
	if Status("Great product honestly") != "pending" {
		t.Fatal("expected remote toxic to force pending")
	}
}

func TestStatusRemoteFailureFallsBack(t *testing.T) {
	t.Setenv("TOXICITY_API_URL", "http://127.0.0.1:1")
	if Status("Great product honestly") != "approved" {
		t.Fatal("network failure must fall back to local approved")
	}
}
