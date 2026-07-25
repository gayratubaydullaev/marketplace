ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_orders_payment_method
    ON orders (tenant_id, payment_method)
    WHERE payment_method <> '';
