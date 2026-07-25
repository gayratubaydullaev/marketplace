-- Structured fields for banner/product funnel analytics.
ALTER TABLE analytics_event_mirror
    ADD COLUMN IF NOT EXISTS entity_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS session_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_aem_tenant_type_time
    ON analytics_event_mirror (tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aem_tenant_entity_type
    ON analytics_event_mirror (tenant_id, entity_id, event_type);
