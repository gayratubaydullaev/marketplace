# Citus / sharding notes (TZ §5.1)

## Goal
Shard by `tenant_id` so each tenant's hot path stays on one worker.

## Local / staging without Citus
Current schema uses plain PostgreSQL 16 + `marketplace` schema. Migrations remain compatible.

## Enabling Citus
1. Use Citus-enabled image (e.g. `citusdata/citus:12`).
2. `CREATE EXTENSION citus;`
3. `SELECT create_distributed_table('products', 'tenant_id');` (and orders, users, carts, …).
4. Reference tables: `categories` (small), `fx_rates`, tenant config — `create_reference_table`.

## App changes
- Always include `tenant_id` in WHERE for distributed tables.
- Avoid cross-tenant JOINs.
- Connection string points at coordinator.

See also `infra/docker/docker-compose.ha.yml` for HA topology comments.
