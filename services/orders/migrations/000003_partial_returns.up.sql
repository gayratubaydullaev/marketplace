-- Partial returns + returned quantity tracking
ALTER TABLE order_returns ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE order_returns ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS returned_quantity INTEGER DEFAULT 0;
