package config

import (
	"os"

	commoncfg "github.com/gayrat/marketplace/packages/go-common/config"
)

func Load() commoncfg.Config {
	cfg := commoncfg.Load("analytics-service")
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8010"
	}
	return cfg
}
