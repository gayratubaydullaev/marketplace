# Citus / sharding notes (TZ §5.1)

## Goal
Shard by `tenant_id` so each tenant's hot path stays on one worker.

## Local HA profile
```bash
docker compose -f infra/docker/docker-compose.ha.yml --profile citus up -d
```
Images: `citusdata/citus:12.1` coordinator (`:5434`) + worker-1 + worker-2.

## Enabling Citus on coordinator
```sql
CREATE EXTENSION IF NOT EXISTS citus;
SELECT citus_set_coordinator_host('citus-coordinator', 5432);
SELECT citus_add_node('citus-worker-1', 5432);
SELECT citus_add_node('citus-worker-2', 5432);

SELECT create_distributed_table('products', 'tenant_id');
SELECT create_distributed_table('orders', 'tenant_id');
SELECT create_distributed_table('users', 'tenant_id');
SELECT create_distributed_table('carts', 'tenant_id');
SELECT create_reference_table('categories');
SELECT create_reference_table('fx_rates');
```

## App requirements
- Always include `tenant_id` in WHERE for distributed tables.
- Avoid cross-tenant JOINs.
- App connection string points at the coordinator.
- Strict RLS (`migrate_v6_rls_strict.sql`) still applies on coordinator.

## Without Citus
Use plain Postgres from `docker-compose.dev.yml` or `postgres-primary` in the HA file.
