ALTER TABLE order_returns DROP COLUMN IF EXISTS items;
ALTER TABLE order_returns DROP COLUMN IF EXISTS refund_amount;
ALTER TABLE order_items DROP COLUMN IF EXISTS returned_quantity;
