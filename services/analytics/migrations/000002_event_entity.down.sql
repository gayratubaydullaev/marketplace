DROP INDEX IF EXISTS idx_aem_tenant_entity_type;
DROP INDEX IF EXISTS idx_aem_tenant_type_time;
ALTER TABLE analytics_event_mirror
    DROP COLUMN IF EXISTS session_id,
    DROP COLUMN IF EXISTS user_id,
    DROP COLUMN IF EXISTS entity_id;
