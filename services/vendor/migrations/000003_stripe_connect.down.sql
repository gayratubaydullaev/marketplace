ALTER TABLE vendor_payouts DROP COLUMN IF EXISTS ledger_note;
ALTER TABLE vendor_payouts DROP COLUMN IF EXISTS stripe_transfer_id;
ALTER TABLE vendors DROP COLUMN IF EXISTS stripe_account_id;
