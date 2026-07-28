#!/usr/bin/env bash
# Quick Citus health check (expects profile already up).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="$ROOT/infra/docker/docker-compose.ha.yml"

docker compose -f "$COMPOSE" exec -T citus-coordinator \
  psql -U marketplace -d marketplace -v ON_ERROR_STOP=1 <<'SQL'
\echo '--- nodes ---'
SELECT nodename, nodeport, isactive FROM pg_dist_node ORDER BY nodeid;
\echo '--- distributed tables ---'
SELECT logicalrelid::text AS table, partmethod, partkey
FROM pg_dist_partition
ORDER BY 1;
\echo '--- tenant shard sample (products) ---'
SELECT COUNT(*) AS product_shards
FROM pg_dist_shard s
JOIN pg_class c ON c.oid = s.logicalrelid
WHERE c.relname = 'products';
SQL

echo "citus-smoke OK"
