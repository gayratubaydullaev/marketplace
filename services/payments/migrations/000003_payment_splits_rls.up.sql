-- Align payment_splits with strict tenant RLS (undo NO FORCE from older boots).
ALTER TABLE IF EXISTS payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payment_splits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_payment_splits ON payment_splits;
CREATE POLICY tenant_isolation_payment_splits ON payment_splits
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
