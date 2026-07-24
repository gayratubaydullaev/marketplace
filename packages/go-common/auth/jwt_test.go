package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func TestManagerIssueAndParseHS256(t *testing.T) {
	t.Setenv("JWT_PRIVATE_KEY_PEM", "")
	t.Setenv("JWT_PUBLIC_KEY_PEM", "")

	manager := NewManager("test-secret", 15, 7)
	if got := manager.Algorithm(); got != "HS256" {
		t.Fatalf("Algorithm() = %q, want HS256", got)
	}

	pair, err := manager.Issue("user-1", "tenant-1", "buyer@example.com", RoleCustomer, "")
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}
	claims, err := manager.Parse(pair.AccessToken)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if claims.UserID != "user-1" || claims.TenantID != "tenant-1" || claims.Role != RoleCustomer {
		t.Fatalf("Parse() claims = %#v", claims)
	}
}

func TestJWKSEmptyForHS256(t *testing.T) {
	_ = os.Unsetenv("JWT_PRIVATE_KEY_PEM")
	m := NewManager("secret", 15, 7)
	raw := string(m.JWKS())
	if raw != `{"keys":[]}` {
		t.Fatalf("unexpected jwks: %s", raw)
	}
}

func b64url(data []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(data), "=")
}

func forgeUnsignedJWT(t *testing.T) string {
	t.Helper()
	header, _ := json.Marshal(map[string]any{"alg": "none", "typ": "JWT"})
	payload, _ := json.Marshal(map[string]any{
		"user_id": "x", "tenant_id": "t", "email": "a@b.c", "role": "super_admin",
		"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "sub": "x", "iss": "gayrat-auth",
	})
	return b64url(header) + "." + b64url(payload) + "."
}

func TestRejectAlgNone(t *testing.T) {
	m := NewManager("test-secret", 15, 7)
	if _, err := m.Parse(forgeUnsignedJWT(t)); err == nil {
		t.Fatal("expected rejection of alg=none")
	}
}

func TestRejectExpiredToken(t *testing.T) {
	m := NewManager("test-secret", 15, 7)
	header, _ := json.Marshal(map[string]any{"alg": "HS256", "typ": "JWT"})
	payload, _ := json.Marshal(map[string]any{
		"user_id": "x", "tenant_id": "t", "email": "a@b.c", "role": "customer",
		"exp": time.Now().Add(-time.Hour).Unix(), "iat": time.Now().Add(-2 * time.Hour).Unix(), "sub": "x", "iss": "gayrat-auth",
	})
	signing := b64url(header) + "." + b64url(payload)
	mac := hmac.New(sha256.New, []byte("test-secret"))
	mac.Write([]byte(signing))
	sig := strings.TrimRight(base64.URLEncoding.EncodeToString(mac.Sum(nil)), "=")
	tok := signing + "." + sig
	if _, err := m.Parse(tok); err == nil {
		t.Fatal("expected expired token rejection")
	}
}

func TestRejectMalformedToken(t *testing.T) {
	m := NewManager("test-secret", 15, 7)
	if _, err := m.Parse("not.a.jwt"); err == nil {
		t.Fatal("expected malformed rejection")
	}
}
