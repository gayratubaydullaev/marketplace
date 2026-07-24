package service

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"crypto/rsa"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type oauthIdentity struct {
	Email     string
	FirstName string
	LastName  string
}

func oauthDevBypassAllowed() bool {
	env := os.Getenv("APP_ENV")
	if env == "production" || env == "prod" {
		return false
	}
	return os.Getenv("OAUTH_DEV_BYPASS") == "1"
}

func verifyOAuthToken(provider, accessToken, fallbackEmail, firstName, lastName string) (*oauthIdentity, error) {
	bypass := oauthDevBypassAllowed()

	switch strings.ToLower(provider) {
	case "google":
		id, err := verifyGoogleIDToken(accessToken)
		if err != nil {
			if bypass && fallbackEmail != "" {
				return &oauthIdentity{Email: strings.ToLower(fallbackEmail), FirstName: firstName, LastName: lastName}, nil
			}
			return nil, err
		}
		if id.FirstName == "" {
			id.FirstName = firstName
		}
		if id.LastName == "" {
			id.LastName = lastName
		}
		return id, nil
	case "apple":
		id, err := verifyAppleIDToken(accessToken)
		if err != nil {
			if bypass && fallbackEmail != "" {
				return &oauthIdentity{Email: strings.ToLower(fallbackEmail), FirstName: firstName, LastName: lastName}, nil
			}
			return nil, err
		}
		if id.FirstName == "" {
			id.FirstName = firstName
		}
		if id.LastName == "" {
			id.LastName = lastName
		}
		return id, nil
	case "facebook":
		id, err := verifyFacebookAccessToken(accessToken)
		if err != nil {
			if bypass && fallbackEmail != "" {
				return &oauthIdentity{Email: strings.ToLower(fallbackEmail), FirstName: firstName, LastName: lastName}, nil
			}
			return nil, err
		}
		if id.FirstName == "" {
			id.FirstName = firstName
		}
		if id.LastName == "" {
			id.LastName = lastName
		}
		return id, nil
	default:
		return nil, fmt.Errorf("unsupported oauth provider")
	}
}

func verifyGoogleIDToken(idToken string) (*oauthIdentity, error) {
	if idToken == "" {
		return nil, fmt.Errorf("missing google id token")
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(idToken))
	if err != nil {
		return nil, fmt.Errorf("google tokeninfo: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("invalid google token")
	}
	var payload struct {
		Email         string `json:"email"`
		EmailVerified string `json:"email_verified"`
		GivenName     string `json:"given_name"`
		FamilyName    string `json:"family_name"`
		Aud           string `json:"aud"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if payload.Email == "" {
		return nil, fmt.Errorf("google token missing email")
	}
	if payload.EmailVerified == "false" {
		return nil, fmt.Errorf("google email not verified")
	}
	if expected := os.Getenv("GOOGLE_OAUTH_CLIENT_ID"); expected != "" && payload.Aud != "" && payload.Aud != expected {
		return nil, fmt.Errorf("google token audience mismatch")
	}
	return &oauthIdentity{
		Email:     strings.ToLower(payload.Email),
		FirstName: payload.GivenName,
		LastName:  payload.FamilyName,
	}, nil
}

func verifyAppleIDToken(idToken string) (*oauthIdentity, error) {
	if idToken == "" {
		return nil, fmt.Errorf("missing apple id token")
	}
	var claims struct {
		Iss   string `json:"iss"`
		Aud   string `json:"aud"`
		Email string `json:"email"`
		Sub   string `json:"sub"`
		jwt.RegisteredClaims
	}
	token, err := jwt.ParseWithClaims(idToken, &claims, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("unexpected apple signing method")
		}
		kid, _ := token.Header["kid"].(string)
		if kid == "" {
			return nil, fmt.Errorf("apple token missing kid")
		}
		return appleJWKSKey(kid)
	})
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid apple token")
	}
	if claims.Iss != "https://appleid.apple.com" {
		return nil, fmt.Errorf("invalid apple issuer")
	}
	if expected := os.Getenv("APPLE_OAUTH_CLIENT_ID"); expected != "" && claims.Aud != expected {
		return nil, fmt.Errorf("apple audience mismatch")
	}
	email := claims.Email
	if email == "" && claims.Sub != "" {
		email = claims.Sub + "@privaterelay.appleid.com"
	}
	if email == "" {
		return nil, fmt.Errorf("apple token missing email")
	}
	return &oauthIdentity{Email: strings.ToLower(email)}, nil
}

func appleJWKSKey(kid string) (*rsa.PublicKey, error) {
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get("https://appleid.apple.com/auth/keys")
	if err != nil {
		return nil, fmt.Errorf("apple jwks: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("apple jwks unavailable")
	}
	var keys struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&keys); err != nil {
		return nil, err
	}
	for _, key := range keys.Keys {
		if key.Kid != kid || key.Kty != "RSA" {
			continue
		}
		n, err := base64.RawURLEncoding.DecodeString(key.N)
		if err != nil {
			return nil, err
		}
		e, err := base64.RawURLEncoding.DecodeString(key.E)
		if err != nil {
			return nil, err
		}
		return &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}, nil
	}
	return nil, fmt.Errorf("apple jwks key not found")
}

func verifyFacebookAccessToken(accessToken string) (*oauthIdentity, error) {
	if accessToken == "" {
		return nil, fmt.Errorf("missing facebook access token")
	}
	client := &http.Client{Timeout: 8 * time.Second}
	appID := os.Getenv("FACEBOOK_APP_ID")
	appSecret := os.Getenv("FACEBOOK_APP_SECRET")
	if appID != "" && appSecret != "" {
		debugURL := fmt.Sprintf(
			"https://graph.facebook.com/debug_token?input_token=%s&access_token=%s|%s",
			url.QueryEscape(accessToken), url.QueryEscape(appID), url.QueryEscape(appSecret),
		)
		resp, err := client.Get(debugURL)
		if err != nil {
			return nil, fmt.Errorf("facebook debug_token: %w", err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var dbg struct {
			Data struct {
				IsValid bool   `json:"is_valid"`
				AppID   string `json:"app_id"`
			} `json:"data"`
		}
		_ = json.Unmarshal(body, &dbg)
		if !dbg.Data.IsValid {
			return nil, fmt.Errorf("invalid facebook token")
		}
		if dbg.Data.AppID != "" && dbg.Data.AppID != appID {
			return nil, fmt.Errorf("facebook app id mismatch")
		}
	}
	meURL := "https://graph.facebook.com/me?fields=id,email,first_name,last_name&access_token=" + url.QueryEscape(accessToken)
	resp, err := client.Get(meURL)
	if err != nil {
		return nil, fmt.Errorf("facebook me: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("invalid facebook token")
	}
	var me struct {
		ID        string `json:"id"`
		Email     string `json:"email"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
	}
	if err := json.Unmarshal(body, &me); err != nil {
		return nil, err
	}
	email := me.Email
	if email == "" && me.ID != "" {
		email = me.ID + "@facebook.local"
	}
	if email == "" {
		return nil, fmt.Errorf("facebook token missing email")
	}
	return &oauthIdentity{
		Email:     strings.ToLower(email),
		FirstName: me.FirstName,
		LastName:  me.LastName,
	}, nil
}
