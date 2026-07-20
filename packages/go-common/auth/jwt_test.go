package auth

import (
	"os"
	"testing"
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
