#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/go/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

PORTS=(8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 8011 8012)
NAMES=(auth catalog search cart orders payments vendor reviews notifications analytics media realtime)

mkdir -p bin logs
make build

# stop previous
for name in "${NAMES[@]}"; do
  if [[ -f "logs/$name.pid" ]]; then
    kill "$(cat "logs/$name.pid")" 2>/dev/null || true
    rm -f "logs/$name.pid"
  fi
done

for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"
  port="${PORTS[$i]}"
  echo "starting $name on $port"
  HTTP_PORT="$port" \
  DATABASE_URL="${DATABASE_URL:-postgres://marketplace:marketplace@localhost:5432/marketplace?sslmode=disable}" \
  REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}" \
  KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9092}" \
  ELASTICSEARCH_URL="${ELASTICSEARCH_URL:-http://localhost:9200}" \
  CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}" \
  CENTRIFUGO_URL="${CENTRIFUGO_URL:-http://localhost:8100}" \
  CENTRIFUGO_SECRET="${CENTRIFUGO_SECRET:-centrifugo-secret}" \
  PAYME_SECRET="${PAYME_SECRET:-payme-sandbox-secret}" \
  CLICK_SECRET="${CLICK_SECRET:-click-sandbox-secret}" \
  UZUM_SECRET="${UZUM_SECRET:-uzum-sandbox-secret}" \
  STRIPE_SECRET="${STRIPE_SECRET:-sk_test_dev}" \
  PAYMENTS_SANDBOX="${PAYMENTS_SANDBOX:-true}" \
  NOTIFY_TRANSPORT="${NOTIFY_TRANSPORT:-log}" \
  CATALOG_URL="${CATALOG_URL:-http://localhost:8002}" \
  "./bin/$name" >"logs/$name.log" 2>&1 &
  echo $! >"logs/$name.pid"
done

echo "Waiting for health..."
for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"
  port="${PORTS[$i]}"
  ok=0
  for attempt in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      echo "  $name OK"
      ok=1
      break
    fi
    sleep 0.5
  done
  if [[ "$ok" != "1" ]]; then
    echo "  $name FAILED (see logs/$name.log)"
  fi
done

echo "All services started. Logs in logs/"
