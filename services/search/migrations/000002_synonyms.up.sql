CREATE TABLE IF NOT EXISTS search_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    term VARCHAR(100) NOT NULL,
    synonyms TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, term)
);

ALTER TABLE search_synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_synonyms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_search_synonyms ON search_synonyms;
CREATE POLICY tenant_isolation_search_synonyms ON search_synonyms
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
