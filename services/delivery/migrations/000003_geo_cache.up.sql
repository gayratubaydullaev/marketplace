CREATE TABLE IF NOT EXISTS geo_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('search', 'reverse')),
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (query_hash, kind)
);

CREATE INDEX IF NOT EXISTS idx_geo_cache_created ON geo_cache (created_at);
