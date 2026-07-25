package config

import "testing"

func TestValidateSecretsDevAllowsDefault(t *testing.T) {
	cfg := Config{Env: "development", JWTSecret: "dev-jwt-secret-change-in-production-uz-marketplace"}
	if err := cfg.ValidateSecrets(); err != nil {
		t.Fatalf("dev should allow default secret: %v", err)
	}
}

func TestValidateSecretsProdRejectsDefault(t *testing.T) {
	t.Setenv("JWT_PRIVATE_KEY_PEM", "")
	t.Setenv("JWT_PUBLIC_KEY_PEM", "")
	cfg := Config{Env: "production", JWTSecret: "dev-jwt-secret-change-in-production-uz-marketplace"}
	if err := cfg.ValidateSecrets(); err == nil {
		t.Fatal("expected error for default JWT secret in production")
	}
}

func TestValidateSecretsProdAcceptsCustom(t *testing.T) {
	t.Setenv("JWT_PRIVATE_KEY_PEM", "")
	t.Setenv("JWT_PUBLIC_KEY_PEM", "")
	cfg := Config{Env: "production", JWTSecret: "a-sufficiently-long-production-secret-value"}
	if err := cfg.ValidateSecrets(); err != nil {
		t.Fatalf("custom secret should pass: %v", err)
	}
}
