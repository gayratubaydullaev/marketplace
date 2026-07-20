-- Phase 0: FORCE RLS + expand tenant isolation
-- Role creation requires CREATEROLE; skip if unavailable (document for ops).
DO $$ BEGIN
  CREATE ROLE marketplace_app NOINHERIT LOGIN PASSWORD 'marketplace_app_change_me';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'skip marketplace_app role (need CREATEROLE)';
WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ BEGIN
  GRANT USAGE ON SCHEMA marketplace TO marketplace_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA marketplace TO marketplace_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA marketplace TO marketplace_app;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'marketplace_app role missing — grants skipped';
WHEN insufficient_privilege THEN
  RAISE NOTICE 'grant skipped';
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','orders','users','vendors','categories','carts','payments',
    'reviews','coupons','gift_certificates','order_items','addresses',
    'product_variants','vendor_payouts','notification_outbox'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s ON %I', t, t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation_%s ON %I USING (tenant_id::text = current_setting(''app.current_tenant'', true) OR current_setting(''app.current_tenant'', true) IS NULL OR current_setting(''app.current_tenant'', true) = '''') WITH CHECK (tenant_id::text = current_setting(''app.current_tenant'', true) OR current_setting(''app.current_tenant'', true) IS NULL OR current_setting(''app.current_tenant'', true) = '''')',
        t, t
      );
    EXCEPTION WHEN undefined_table THEN
      NULL;
    WHEN undefined_column THEN
      NULL;
    END;
  END LOOP;
END $$;
