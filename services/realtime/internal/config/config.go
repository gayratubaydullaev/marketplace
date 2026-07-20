package config

import (
	"os"

	commoncfg "github.com/gayrat/marketplace/packages/go-common/config"
)

func Load() commoncfg.Config {
	cfg := commoncfg.Load("realtime-service")
	if os.Getenv("HTTP_PORT") == "" {
		cfg.HTTPPort = "8012"
	}
	return cfg
}
