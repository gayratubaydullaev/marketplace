package auth

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"math/big"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Role string

const (
	RoleSuperAdmin  Role = "super_admin"
	RoleTenantAdmin Role = "tenant_admin"
	RoleVendor      Role = "vendor"
	RoleCustomer    Role = "customer"
	RoleManager     Role = "manager"
	RoleModerator   Role = "moderator"
)

type Claims struct {
	UserID   string `json:"user_id"`
	TenantID string `json:"tenant_id"`
	Email    string `json:"email"`
	Role     Role   `json:"role"`
	VendorID string `json:"vendor_id,omitempty"`
	jwt.RegisteredClaims
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

// Manager signs with RS256 when JWT_PRIVATE_KEY_PEM is set; otherwise HS256 (dev).
type Manager struct {
	secret     []byte
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	kid        string
	alg        string
	accessTTL  time.Duration
	refreshTTL time.Duration
}

var (
	jwksOnce sync.Once
	jwksJSON []byte
)

func NewManager(secret string, accessMinutes, refreshDays int) *Manager {
	m := &Manager{
		secret:     []byte(secret),
		alg:        "HS256",
		kid:        "hs256-dev",
		accessTTL:  time.Duration(accessMinutes) * time.Minute,
		refreshTTL: time.Duration(refreshDays) * 24 * time.Hour,
	}
	if pemStr := os.Getenv("JWT_PRIVATE_KEY_PEM"); pemStr != "" {
		if block, _ := pem.Decode([]byte(pemStr)); block != nil {
			if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
				m.privateKey = key
				m.publicKey = &key.PublicKey
				m.alg = "RS256"
				m.kid = getEnv("JWT_KID", "gayrat-rs256-1")
			} else if keyAny, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
				if key, ok := keyAny.(*rsa.PrivateKey); ok {
					m.privateKey = key
					m.publicKey = &key.PublicKey
					m.alg = "RS256"
					m.kid = getEnv("JWT_KID", "gayrat-rs256-1")
				}
			}
		}
	}
	if pubPEM := os.Getenv("JWT_PUBLIC_KEY_PEM"); pubPEM != "" && m.publicKey == nil {
		if block, _ := pem.Decode([]byte(pubPEM)); block != nil {
			if pub, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
				if rsaPub, ok := pub.(*rsa.PublicKey); ok {
					m.publicKey = rsaPub
					m.alg = "RS256"
					m.kid = getEnv("JWT_KID", "gayrat-rs256-1")
				}
			}
		}
	}
	return m
}

func getEnv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func (m *Manager) Algorithm() string { return m.alg }
func (m *Manager) Kid() string       { return m.kid }

func (m *Manager) Issue(userID, tenantID, email string, role Role, vendorID string) (*TokenPair, error) {
	now := time.Now()
	accessClaims := Claims{
		UserID: userID, TenantID: tenantID, Email: email, Role: role, VendorID: vendorID,
		RegisteredClaims: jwt.RegisteredClaims{
			ID: uuid.NewString(), Subject: userID,
			IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(m.accessTTL)),
			Issuer: "gayrat-auth",
		},
	}
	refreshClaims := Claims{
		UserID: userID, TenantID: tenantID, Email: email, Role: role, VendorID: vendorID,
		RegisteredClaims: jwt.RegisteredClaims{
			ID: uuid.NewString(), Subject: userID,
			IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(m.refreshTTL)),
			Issuer: "gayrat-auth",
		},
	}
	access, err := m.sign(accessClaims)
	if err != nil {
		return nil, err
	}
	refresh, err := m.sign(refreshClaims)
	if err != nil {
		return nil, err
	}
	return &TokenPair{AccessToken: access, RefreshToken: refresh, ExpiresIn: int64(m.accessTTL.Seconds())}, nil
}

func (m *Manager) sign(claims Claims) (string, error) {
	var token *jwt.Token
	if m.privateKey != nil {
		token = jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		token.Header["kid"] = m.kid
		return token.SignedString(m.privateKey)
	}
	token = jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["kid"] = m.kid
	return token.SignedString(m.secret)
}

func (m *Manager) Parse(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		alg, _ := t.Header["alg"].(string)
		if alg == "" || strings.EqualFold(alg, "none") {
			return nil, errors.New("rejected unsigned token")
		}
		switch method := t.Method.(type) {
		case *jwt.SigningMethodRSA:
			if method.Name != "RS256" {
				return nil, errors.New("unexpected RSA signing method")
			}
			if m.publicKey == nil {
				return nil, errors.New("RS256 public key not configured")
			}
			// Alg confusion: never accept HMAC when this manager is RS256-primary.
			return m.publicKey, nil
		case *jwt.SigningMethodHMAC:
			if method.Name != "HS256" {
				return nil, errors.New("unexpected HMAC signing method")
			}
			// When RS256 keys are configured, reject HS256 tokens (classic alg confusion).
			if m.privateKey != nil || m.publicKey != nil {
				return nil, errors.New("HS256 rejected: RS256 required")
			}
			return m.secret, nil
		default:
			return nil, errors.New("unexpected signing method")
		}
	}, jwt.WithValidMethods([]string{"RS256", "HS256"}))
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// JWKS returns RFC 7517 JSON for RS256 public key (empty keys if HS256-only).
func (m *Manager) JWKS() json.RawMessage {
	if m.publicKey == nil {
		return json.RawMessage(`{"keys":[]}`)
	}
	jwksOnce.Do(func() {
		n := base64.RawURLEncoding.EncodeToString(m.publicKey.N.Bytes())
		e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(m.publicKey.E)).Bytes())
		jwksJSON, _ = json.Marshal(map[string]any{
			"keys": []map[string]string{{
				"kty": "RSA", "use": "sig", "alg": "RS256", "kid": m.kid, "n": n, "e": e,
			}},
		})
	})
	return jwksJSON
}
