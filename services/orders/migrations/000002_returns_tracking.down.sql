DROP TABLE IF EXISTS order_returns;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_carrier;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_number;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_url;
ALTER TABLE orders DROP COLUMN IF EXISTS shipped_at;
