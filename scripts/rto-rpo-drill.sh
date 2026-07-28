#!/usr/bin/env bash
# Guided RTO/RPO drill for local HA / Citus staging (authorized environments only).
# Records wall-clock restore metrics; does not replace Multi-AZ cloud drills.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_DEV="$ROOT/infra/docker/docker-compose.dev.yml"
COMPOSE_HA="$ROOT/infra/docker/docker-compose.ha.yml"
MODE="${DRILL_MODE:-postgres}" # postgres | citus
LOG="${DRILL_LOG:-$ROOT/logs/rto-rpo-drill-$(date +%Y%m%d-%H%M%S).log}"
mkdir -p "$(dirname "$LOG")"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "[$(ts)] $*" | tee -a "$LOG"; }

START_EPOCH=$(date +%s)
log "RTO/RPO drill start mode=$MODE"

case "$MODE" in
  postgres)
    log "Snapshot marker: select max(created_at) from orders (manual note)"
    BEFORE=$(docker compose -f "$COMPOSE_DEV" exec -T postgres \
      psql -U marketplace -d marketplace -Atc "SELECT COALESCE(MAX(created_at)::text,'none') FROM orders" 2>/dev/null || echo "unavailable")
    log "last_order_before=$BEFORE"
    log "Simulating primary stop..."
    FAIL_EPOCH=$(date +%s)
    docker compose -f "$COMPOSE_DEV" stop postgres || true
    log "Primary stopped. Restore: docker compose -f infra/docker/docker-compose.dev.yml start postgres"
    read -r -p "Press Enter after postgres is healthy again..." _
    docker compose -f "$COMPOSE_DEV" start postgres || true
    for i in $(seq 1 60); do
      if docker compose -f "$COMPOSE_DEV" exec -T postgres pg_isready -U marketplace >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
    AFTER=$(docker compose -f "$COMPOSE_DEV" exec -T postgres \
      psql -U marketplace -d marketplace -Atc "SELECT COALESCE(MAX(created_at)::text,'none') FROM orders" 2>/dev/null || echo "unavailable")
    log "last_order_after=$AFTER"
    ;;
  citus)
    log "Using Citus coordinator :5434"
    BEFORE=$(docker compose -f "$COMPOSE_HA" exec -T citus-coordinator \
      psql -U marketplace -d marketplace -Atc "SELECT COALESCE(MAX(created_at)::text,'none') FROM orders" 2>/dev/null || echo "unavailable")
    log "last_order_before=$BEFORE"
    FAIL_EPOCH=$(date +%s)
    docker compose -f "$COMPOSE_HA" --profile citus stop citus-coordinator || true
    log "Coordinator stopped. Restore: docker compose ... start citus-coordinator"
    read -r -p "Press Enter after coordinator is healthy again..." _
    docker compose -f "$COMPOSE_HA" --profile citus start citus-coordinator || true
    for i in $(seq 1 60); do
      if docker compose -f "$COMPOSE_HA" exec -T citus-coordinator pg_isready -U marketplace >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
    AFTER=$(docker compose -f "$COMPOSE_HA" exec -T citus-coordinator \
      psql -U marketplace -d marketplace -Atc "SELECT COALESCE(MAX(created_at)::text,'none') FROM orders" 2>/dev/null || echo "unavailable")
    log "last_order_after=$AFTER"
    ;;
  *)
    echo "DRILL_MODE=postgres|citus" >&2
    exit 1
    ;;
esac

END_EPOCH=$(date +%s)
RTO=$((END_EPOCH - FAIL_EPOCH))
log "RTO_seconds=$RTO (target < 900)"
log "RPO note: compare last_order_before vs after; target < 60s data loss"
log "API health check (optional): curl -sf ${API_BASE:-http://localhost:8080}/health"
log "Drill complete. Log: $LOG"

if [[ "$RTO" -gt 900 ]]; then
  log "WARN RTO exceeded 15m target"
  exit 2
fi
echo "OK — see $LOG"
