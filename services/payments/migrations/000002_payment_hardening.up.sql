-- Idempotent payment ledger + scoped idempotency keys
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tenant_idempotency
    ON payments (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS idx_payment_splits_payment_pending
    ON payment_splits (payment_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_splits_vendor_pending
    ON payment_splits (tenant_id, vendor_id, status)
    WHERE vendor_id IS NOT NULL AND status = 'pending';
