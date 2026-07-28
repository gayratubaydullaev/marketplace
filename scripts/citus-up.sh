#!/usr/bin/env bash
# Bring up Citus staging profile and bootstrap distributed tables.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="$ROOT/infra/docker/docker-compose.ha.yml"
CITUS_URL="${CITUS_URL:-postgres://marketplace:marketplace@localhost:5434/marketplace?sslmode=disable}"

echo "==> Starting Citus coordinator + workers"
docker compose -f "$COMPOSE" --profile citus up -d citus-coordinator citus-worker-1 citus-worker-2

echo "==> Waiting for coordinator :5434"
for i in $(seq 1 60); do
  if docker compose -f "$COMPOSE" exec -T citus-coordinator pg_isready -U marketplace >/dev/null 2>&1; then
    break
  fi
  sleep 2
  if [[ $i -eq 60 ]]; then
    echo "coordinator not ready" >&2
    exit 1
  fi
done

# Optional: apply base migrations against coordinator when empty.
if [[ "${CITUS_MIGRATE:-0}" == "1" ]]; then
  echo "==> Migrating schema onto Citus coordinator"
  DATABASE_URL="$CITUS_URL" "$ROOT/scripts/migrate.sh"
fi

echo "==> Bootstrapping Citus nodes + distributed tables"
docker compose -f "$COMPOSE" exec -T citus-coordinator \
  psql -U marketplace -d marketplace -v ON_ERROR_STOP=1 \
  -f - < "$ROOT/infra/docker/citus-bootstrap.sql"

echo "==> Smoke queries"
docker compose -f "$COMPOSE" exec -T citus-coordinator \
  psql -U marketplace -d marketplace -v ON_ERROR_STOP=1 <<'SQL'
SELECT COUNT(*) AS nodes FROM pg_dist_node WHERE isactive;
SELECT COUNT(*) AS distributed FROM pg_dist_partition WHERE partmethod = 'h';
SELECT COUNT(*) AS reference FROM pg_dist_partition WHERE partmethod = 'n';
SQL

echo "OK — point DATABASE_URL at $CITUS_URL for staging app traffic"
echo "Verify: docker compose -f infra/docker/docker-compose.ha.yml --profile citus ps"
