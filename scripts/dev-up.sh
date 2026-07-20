#!/usr/bin/env bash
# One-command local stack: Redis → Go services → gateway → frontends
set -euo pipefail
export PATH="$HOME/.local/go/bin:$HOME/.local/share/pnpm:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs bin

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

echo "== Gayrat dev-up =="

# Redis
if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
  echo "Redis: already up"
elif [[ -x "$ROOT/.tools/redis-server" ]]; then
  if ! "$ROOT/.tools/redis-cli" ping >/dev/null 2>&1; then
    "$ROOT/.tools/redis-server" --daemonize yes --port 6379 --dir /tmp --dbfilename gayrat-redis.rdb
    echo "Redis: started (.tools)"
  else
    echo "Redis: already up (.tools)"
  fi
else
  echo "WARN: Redis not found — auth rate-limit/OTP may degrade"
fi

# Backend
./scripts/run-services.sh

# Gateway
if [[ -f logs/gateway.pid ]]; then
  kill "$(cat logs/gateway.pid)" 2>/dev/null || true
  rm -f logs/gateway.pid
fi
nohup go run "$ROOT/scripts/dev-gateway/main.go" >logs/gateway.log 2>&1 &
echo $! >logs/gateway.pid
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8080/health >/dev/null 2>&1; then
    echo "Gateway: OK :8080"
    break
  fi
  sleep 0.3
done

# Frontends
stop_web() {
  local name="$1"
  if [[ -f "logs/$name.pid" ]]; then
    kill "$(cat "logs/$name.pid")" 2>/dev/null || true
    rm -f "logs/$name.pid"
  fi
}
stop_web web-storefront
stop_web web-admin
stop_web web-vendor

NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:8080}" \
  nohup pnpm --filter @gayrat/storefront dev >logs/web-storefront.log 2>&1 &
echo $! >logs/web-storefront.pid

NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:8080}" \
  nohup pnpm --filter @gayrat/admin dev >logs/web-admin.log 2>&1 &
echo $! >logs/web-admin.pid

NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:8080}" \
  nohup pnpm --filter @gayrat/vendor dev >logs/web-vendor.log 2>&1 &
echo $! >logs/web-vendor.pid

echo "Waiting for Next.js…"
for port in 3000 3001 3002; do
  ok=0
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "http://127.0.0.1:${port}/" 2>/dev/null; then
      echo "  :${port} OK"
      ok=1
      break
    fi
    # 307 redirect counts as up for storefront
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:${port}/" 2>/dev/null || true)
    if [[ "$code" =~ ^(200|307|308)$ ]]; then
      echo "  :${port} OK ($code)"
      ok=1
      break
    fi
    sleep 0.5
  done
  [[ "$ok" == "1" ]] || echo "  :${port} still starting (see logs/web-*.log)"
done

cat <<EOF

Ready.
  Storefront  http://localhost:3000/uz
  Admin       http://localhost:3001
  Vendor      http://localhost:3002
  API gateway http://localhost:8080/health

  Admin:  admin@gayrat.uz / Admin123!
  Vendor: vendor@gayrat.uz / Vendor123!

  Seed:  ./scripts/seed.sh
  Smoke: ./scripts/e2e-smoke.sh
  Logs:  logs/
EOF
