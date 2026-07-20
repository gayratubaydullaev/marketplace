#!/usr/bin/env bash
# Lightweight local API gateway (no Docker Kong required).
# Proxies /v1/* to Go services on 8001–8012.
set -euo pipefail
PORT="${GATEWAY_PORT:-8080}"
export PATH="$HOME/.local/go/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec go run "$ROOT/scripts/dev-gateway/main.go"
