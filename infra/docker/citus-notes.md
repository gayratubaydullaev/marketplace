# Citus / sharding notes (TZ §5.1)

## Goal
Shard by `tenant_id` so each tenant's hot path stays on one worker.

## One-command local staging

```bash
./scripts/citus-up.sh        # compose --profile citus + bootstrap SQL
./scripts/citus-smoke.sh     # verify nodes + partitions
```

Coordinator is exposed on **localhost:5434**.

Images: `citusdata/citus:12.1` — `citus-coordinator`, `citus-worker-1`, `citus-worker-2`
on network `gayrat-citus`.

## Manual bootstrap

```bash
docker compose -f infra/docker/docker-compose.ha.yml --profile citus up -d
psql "postgres://marketplace:marketplace@localhost:5434/marketplace?sslmode=disable" \
  -f infra/docker/citus-bootstrap.sql
```

`citus-bootstrap.sql` runs:

- `CREATE EXTENSION citus`
- `citus_set_coordinator_host` / `citus_add_node` for both workers
- `create_distributed_table(..., 'tenant_id')` for products, orders, users, carts,
  payments, reviews, …
- `create_reference_table` for categories, fx_rates, tenants, coupons

## App requirements
- Always include `tenant_id` in WHERE for distributed tables.
- Avoid cross-tenant JOINs.
- App `DATABASE_URL` points at the coordinator (`:5434` locally).
- Strict RLS (`migrate_v6_rls_strict.sql`) still applies on coordinator.

## Without Citus
Use plain Postgres from `docker-compose.dev.yml` or `postgres-primary` in the HA file.

## Ops
Full staging checklist (Vault, RTO/RPO, k6): [docs/STAGING.md](../../docs/STAGING.md).
