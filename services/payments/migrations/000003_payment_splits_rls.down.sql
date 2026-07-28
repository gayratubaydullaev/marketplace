DROP POLICY IF EXISTS tenant_isolation_payment_splits ON payment_splits;
ALTER TABLE IF EXISTS payment_splits NO FORCE ROW LEVEL SECURITY;
