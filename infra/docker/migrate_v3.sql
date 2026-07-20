-- Additive schema for TZ finish plan (safe to re-run)
CREATE TABLE IF NOT EXISTS notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject TEXT,
    body TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    payment_id UUID NOT NULL,
    order_id UUID NOT NULL,
    vendor_id UUID,
    gross_amount DECIMAL(14,2) NOT NULL,
    commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10,
    commission_amount DECIMAL(14,2) NOT NULL,
    vendor_amount DECIMAL(14,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'UZS',
    status VARCHAR(20) DEFAULT 'pending',
    payout_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    term VARCHAR(100) NOT NULL,
    synonyms TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, term)
);

CREATE INDEX IF NOT EXISTS idx_payment_splits_vendor ON payment_splits (vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_splits_payment ON payment_splits (payment_id);
