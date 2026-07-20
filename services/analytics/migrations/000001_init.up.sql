-- Analytics primarily uses ClickHouse (infra/docker/clickhouse-init.sql).
-- Optional PG mirror for local debugging:
CREATE TABLE IF NOT EXISTS analytics_event_mirror (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
