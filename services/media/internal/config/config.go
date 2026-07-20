package config

import (
	"os"

	commoncfg "github.com/gayrat/marketplace/packages/go-common/config"
)

func Load() commoncfg.Config {
	cfg := commoncfg.Load("media-service")
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8011"
	}
	return cfg
}
