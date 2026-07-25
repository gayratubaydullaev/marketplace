ALTER TABLE delivery_messages
  ADD COLUMN IF NOT EXISTS to_role TEXT NOT NULL DEFAULT 'all';

COMMENT ON COLUMN delivery_messages.to_role IS 'Intended audience: all|customer|vendor|courier|tenant_admin';
