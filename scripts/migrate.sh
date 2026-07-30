#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
DB="${DATABASE_URL:-postgres://marketplace:marketplace@localhost:5432/marketplace?sslmode=disable}"
ORDER=(auth catalog vendor cart orders payments reviews search notifications media analytics realtime delivery)

echo "Migrating against $DB"
for svc in "${ORDER[@]}"; do
  dir="$ROOT/services/$svc/migrations"
  if [[ -d "$dir" ]]; then
    echo "→ $svc"
    for f in "$dir"/*.up.sql; do
      [[ -f "$f" ]] || continue
      echo "  $f"
      psql "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
    done
  fi
done
# apply v2 additive migration
psql "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/infra/docker/migrate_v2.sql" >/dev/null
# payment splits + outbox extras
psql "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/infra/docker/migrate_v3.sql" >/dev/null
# FORCE RLS + app role
psql "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/infra/docker/migrate_v4_rls.sql" >/dev/null
# FX rates, locale extras, citus prep markers
psql "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/infra/docker/migrate_v5_prod.sql" >/dev/null
# Strict RLS (no NULL-tenant bypass) + audit_logs
psql "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/infra/docker/migrate_v6_rls_strict.sql" >/dev/null
echo "Done."
