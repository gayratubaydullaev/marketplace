-- Citus bootstrap for staging/HA profile (idempotent).
-- Run against coordinator after workers are up:
--   psql "$CITUS_URL" -v ON_ERROR_STOP=1 -f infra/docker/citus-bootstrap.sql

CREATE EXTENSION IF NOT EXISTS citus;

-- Coordinator identity (compose service hostname).
SELECT citus_set_coordinator_host('citus-coordinator', 5432);

-- Register workers (ignore duplicates).
DO $$
BEGIN
  PERFORM citus_add_node('citus-worker-1', 5432);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'citus-worker-1: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM citus_add_node('citus-worker-2', 5432);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'citus-worker-2: %', SQLERRM;
END $$;

-- Shard hot-path tables by tenant_id when present and not yet distributed.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products',
    'orders',
    'order_items',
    'users',
    'carts',
    'payments',
    'payment_splits',
    'reviews',
    'addresses',
    'vendors',
    'notifications',
    'wishlists',
    'wishlist_items'
  ]
  LOOP
    BEGIN
      EXECUTE format('SELECT create_distributed_table(%L, %L)', t, 'tenant_id');
      RAISE NOTICE 'distributed %', t;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'skip missing table %', t;
    WHEN OTHERS THEN
      -- already distributed / wrong shape
      RAISE NOTICE 'skip %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- Reference (replicated) lookup tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories', 'fx_rates', 'tenants', 'coupons']
  LOOP
    BEGIN
      EXECUTE format('SELECT create_reference_table(%L)', t);
      RAISE NOTICE 'reference %', t;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'skip missing reference %', t;
    WHEN OTHERS THEN
      RAISE NOTICE 'skip reference %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- Smoke: show cluster membership.
SELECT nodename, nodeport, isactive FROM pg_dist_node ORDER BY nodeid;
