-- Migration: Max TZ completion (P0 schema)
-- Safe to run on existing DBs (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'unpaid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(30) DEFAULT 'unfulfilled';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_total DECIMAL(14,2) DEFAULT 0;

ALTER TABLE products ADD COLUMN IF NOT EXISTS rating DECIMAL(2,1) DEFAULT 0.0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0;

ALTER TABLE carts ADD COLUMN IF NOT EXISTS gift_certificate_code VARCHAR(50);

CREATE TABLE IF NOT EXISTS gift_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    balance DECIMAL(14,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'UZS',
    status VARCHAR(20) DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL UNIQUE,
    email BOOLEAN DEFAULT TRUE,
    sms BOOLEAN DEFAULT TRUE,
    push BOOLEAN DEFAULT TRUE,
    in_app BOOLEAN DEFAULT TRUE,
    order_updates BOOLEAN DEFAULT TRUE,
    promotions BOOLEAN DEFAULT FALSE,
    digest VARCHAR(20) DEFAULT 'instant',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    query TEXT NOT NULL,
    locale VARCHAR(5) DEFAULT 'uz',
    results_count INTEGER DEFAULT 0,
    user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    slug VARCHAR(100) NOT NULL,
    translations JSONB NOT NULL DEFAULT '{}',
    type VARCHAR(30) DEFAULT 'text',
    options JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_tenant ON search_queries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_certs_code ON gift_certificates(tenant_id, code);

INSERT INTO gift_certificates (id, tenant_id, code, balance, currency, status)
VALUES (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000001',
    'GIFT50K',
    50000,
    'UZS',
    'active'
) ON CONFLICT DO NOTHING;

INSERT INTO coupons (id, tenant_id, code, type, value, min_order, max_uses, status, starts_at, ends_at)
VALUES (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000001',
    'WELCOME10',
    'percent',
    10,
    100000,
    1000,
    'active',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '365 days'
) ON CONFLICT DO NOTHING;
