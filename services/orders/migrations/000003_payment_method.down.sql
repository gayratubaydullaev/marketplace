DROP INDEX IF EXISTS idx_orders_payment_method;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_method;
