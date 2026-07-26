package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	ServiceName string
	HTTPPort    string
	DatabaseURL string
	RedisURL    string
	KafkaBrokers []string
	JWTSecret   string
	JWTAccessTTLMinutes  int
	JWTRefreshTTLDays    int
	ElasticsearchURL string
	MinioEndpoint    string
	MinioAccessKey   string
	MinioSecretKey   string
	MinioBucket      string
	ClickHouseURL    string
	CentrifugoURL    string
	CentrifugoSecret string
	DefaultLocale    string
	DefaultCurrency  string
	Env              string
}

func Load(serviceName string) Config {
	return Config{
		ServiceName:          serviceName,
		HTTPPort:             getEnv("HTTP_PORT", "8000"),
		DatabaseURL:          getEnv("DATABASE_URL", "postgres://marketplace:marketplace@localhost:5432/marketplace?sslmode=disable"),
		RedisURL:             getEnv("REDIS_URL", "redis://localhost:6379/0"),
		KafkaBrokers:         strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ","),
		JWTSecret:            getEnv("JWT_SECRET", "dev-jwt-secret-change-in-production-uz-marketplace"),
		JWTAccessTTLMinutes:  getEnvInt("JWT_ACCESS_TTL_MINUTES", 15),
		JWTRefreshTTLDays:    getEnvInt("JWT_REFRESH_TTL_DAYS", 7),
		ElasticsearchURL:     getEnv("ELASTICSEARCH_URL", "http://localhost:9200"),
		MinioEndpoint:        getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey:       getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinioSecretKey:       getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinioBucket:          getEnv("MINIO_BUCKET", "marketplace"),
		ClickHouseURL:        getEnv("CLICKHOUSE_URL", "http://localhost:8123"),
		CentrifugoURL:        getEnv("CENTRIFUGO_URL", "http://localhost:8100"),
		CentrifugoSecret:     getEnv("CENTRIFUGO_SECRET", "centrifugo-secret"),
		DefaultLocale:        getEnv("DEFAULT_LOCALE", "uz"),
		DefaultCurrency:      getEnv("DEFAULT_CURRENCY", "UZS"),
		Env:                  getEnv("APP_ENV", "development"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

var insecureJWTSecrets = map[string]struct{}{
	"": {},
	"dev-jwt-secret-change-in-production-uz-marketplace": {},
	"CHANGE_ME_USE_RS256_IN_PROD":                        {},
	"CHANGE_ME": {},
}

// IsProduction reports whether APP_ENV is production/prod.
func IsProduction() bool {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	return env == "production" || env == "prod"
}

// ValidateSecrets fails closed in production when JWT material is missing or still a placeholder.
func (c Config) ValidateSecrets() error {
	if !IsProduction() {
		return nil
	}
	if strings.TrimSpace(os.Getenv("JWT_PRIVATE_KEY_PEM")) != "" && strings.TrimSpace(os.Getenv("JWT_PUBLIC_KEY_PEM")) != "" {
		return nil
	}
	if _, bad := insecureJWTSecrets[strings.TrimSpace(c.JWTSecret)]; bad {
		return errors.New("APP_ENV=production requires JWT_PRIVATE_KEY_PEM/JWT_PUBLIC_KEY_PEM or a non-default JWT_SECRET")
	}
	return nil
}
