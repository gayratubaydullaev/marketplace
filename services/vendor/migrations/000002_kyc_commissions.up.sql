ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) NOT NULL DEFAULT 'pending';

UPDATE vendors
SET kyc_status = CASE
    WHEN kyc_verified THEN 'approved'
    ELSE 'pending'
END
WHERE kyc_status IS NULL
   OR kyc_status NOT IN ('pending', 'approved', 'rejected')
   OR (kyc_verified AND kyc_status = 'pending');

ALTER TABLE vendors
    DROP CONSTRAINT IF EXISTS vendors_kyc_status_check;
ALTER TABLE vendors
    ADD CONSTRAINT vendors_kyc_status_check
    CHECK (kyc_status IN ('pending', 'approved', 'rejected'));

CREATE TABLE IF NOT EXISTS commission_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    min_volume DECIMAL(14,2) NOT NULL,
    max_volume DECIMAL(14,2),
    rate DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (min_volume >= 0),
    CHECK (max_volume IS NULL OR max_volume > min_volume),
    CHECK (rate >= 0 AND rate <= 100)
);
CREATE INDEX IF NOT EXISTS commission_tiers_tenant_volume_idx
    ON commission_tiers (tenant_id, min_volume);

CREATE TABLE IF NOT EXISTS category_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    category_id UUID NOT NULL,
    rate DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, category_id),
    CHECK (rate >= 0 AND rate <= 100)
);

UPDATE vendor_payouts SET status='completed' WHERE status='paid_sandbox';
ALTER TABLE vendor_payouts
    DROP CONSTRAINT IF EXISTS vendor_payouts_status_check;
ALTER TABLE vendor_payouts
    ADD CONSTRAINT vendor_payouts_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
