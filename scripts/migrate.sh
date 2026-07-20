#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${DATABASE_URL:-postgres://marketplace:marketplace@localhost:5432/marketplace?sslmode=disable}"
ORDER=(auth catalog vendor cart orders payments reviews search notifications media analytics realtime)

echo "Migrating against $DB"
for svc in "${ORDER[@]}"; do
  dir="$ROOT/services/$svc/migrations"
  if [[ -d "$dir" ]]; then
    echo "→ $svc"
    for f in "$dir"/*.up.sql; do
      [[ -f "$f" ]] || continue
      psql "$DB" -v ON_ERROR_STOP=0 -f "$f" >/dev/null
    done
  fi
done
# apply v2 additive migration
psql "$DB" -v ON_ERROR_STOP=0 -f "$ROOT/infra/docker/migrate_v2.sql" >/dev/null || true
# payment splits + outbox extras
psql "$DB" -v ON_ERROR_STOP=0 -f "$ROOT/infra/docker/migrate_v3.sql" >/dev/null || true
# FORCE RLS + app role
psql "$DB" -v ON_ERROR_STOP=0 -f "$ROOT/infra/docker/migrate_v4_rls.sql" >/dev/null || true
# FX rates, locale extras, citus prep markers
psql "$DB" -v ON_ERROR_STOP=0 -f "$ROOT/infra/docker/migrate_v5_prod.sql" >/dev/null || true
echo "Done."
