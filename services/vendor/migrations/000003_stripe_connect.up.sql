ALTER TABLE vendors ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255);
ALTER TABLE vendor_payouts ADD COLUMN IF NOT EXISTS stripe_transfer_id VARCHAR(255);
ALTER TABLE vendor_payouts ADD COLUMN IF NOT EXISTS ledger_note TEXT;
