CREATE TABLE IF NOT EXISTS hero_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    image_url TEXT NOT NULL,
    headline VARCHAR(500) DEFAULT '',
    sub VARCHAR(1000) DEFAULT '',
    cta_label VARCHAR(200) DEFAULT '',
    cta_href VARCHAR(500) DEFAULT '',
    cta2_label VARCHAR(200) DEFAULT '',
    cta2_href VARCHAR(500) DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    show_brand BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hero_banners_tenant_active
    ON hero_banners (tenant_id, active, sort_order);
