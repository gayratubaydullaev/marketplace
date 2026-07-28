DROP TABLE IF EXISTS category_commissions;
DROP TABLE IF EXISTS commission_tiers;
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_kyc_status_check;
ALTER TABLE vendors DROP COLUMN IF EXISTS kyc_status;
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vendor_payouts_status_check;
ALTER TABLE vendor_payouts
    ADD CONSTRAINT vendor_payouts_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'paid_sandbox'));
