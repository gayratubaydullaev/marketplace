-- Strict RLS: deny access when app.current_tenant is unset.
-- Replaces the NULL/empty-tenant bypass from migrate_v4_rls.sql.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','orders','users','vendors','categories','carts','payments',
    'reviews','coupons','gift_certificates','order_items','addresses',
    'product_variants','vendor_payouts','notification_outbox','audit_logs',
    'wishlists','wishlist_items'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s ON %I', t, t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation_%s ON %I '
        'USING (current_setting(''app.current_tenant'', true) IS NOT NULL '
        '  AND current_setting(''app.current_tenant'', true) <> '''' '
        '  AND tenant_id::text = current_setting(''app.current_tenant'', true)) '
        'WITH CHECK (current_setting(''app.current_tenant'', true) IS NOT NULL '
        '  AND current_setting(''app.current_tenant'', true) <> '''' '
        '  AND tenant_id::text = current_setting(''app.current_tenant'', true))',
        t, t
      );
    EXCEPTION WHEN undefined_table THEN
      NULL;
    WHEN undefined_column THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Audit log table (also covered by RLS when present)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    actor_id UUID,
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    before_state JSONB,
    after_state JSONB,
    ip VARCHAR(64),
    user_agent TEXT,
    correlation_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

DO $$ BEGIN
  ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;
  CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    USING (
      current_setting('app.current_tenant', true) IS NOT NULL
      AND current_setting('app.current_tenant', true) <> ''
      AND tenant_id::text = current_setting('app.current_tenant', true)
    )
    WITH CHECK (
      current_setting('app.current_tenant', true) IS NOT NULL
      AND current_setting('app.current_tenant', true) <> ''
      AND tenant_id::text = current_setting('app.current_tenant', true)
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
