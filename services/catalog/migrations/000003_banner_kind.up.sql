ALTER TABLE hero_banners
    ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'hero';

CREATE INDEX IF NOT EXISTS idx_hero_banners_tenant_kind
    ON hero_banners (tenant_id, kind, active, sort_order);
