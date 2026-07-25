package config

import (
	"os"

	commoncfg "github.com/gayrat/marketplace/packages/go-common/config"
)

type Config struct {
	commoncfg.Config
	PaymentsURL          string
	YandexGeocoderAPIKey string
}

func Load() Config {
	cfg := commoncfg.Load("delivery-service")
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8013"
	}
	return Config{
		Config:               cfg,
		PaymentsURL:          getenv("PAYMENTS_URL", "http://127.0.0.1:8006"),
		YandexGeocoderAPIKey: getenv("YANDEX_GEOCODER_API_KEY", ""),
	}
}

func (c Config) ValidateSecrets() error {
	return c.Config.ValidateSecrets()
}

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
