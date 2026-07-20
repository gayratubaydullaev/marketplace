package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type oauthIdentity struct {
	Email     string
	FirstName string
	LastName  string
}

func verifyOAuthToken(provider, accessToken, fallbackEmail, firstName, lastName string) (*oauthIdentity, error) {
	bypass := os.Getenv("OAUTH_DEV_BYPASS") == "1" &&
		(os.Getenv("APP_ENV") == "development" || os.Getenv("APP_ENV") == "" || os.Getenv("APP_ENV") == "dev")

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
	case "apple", "facebook":
		if bypass && fallbackEmail != "" {
			return &oauthIdentity{Email: strings.ToLower(fallbackEmail), FirstName: firstName, LastName: lastName}, nil
		}
		return nil, fmt.Errorf("%s oauth requires OAUTH_DEV_BYPASS=1 in development or provider SDK wiring", provider)
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
