ALTER TABLE vendors
    DROP COLUMN IF EXISTS warehouse_updated_at,
    DROP COLUMN IF EXISTS warehouse_lng,
    DROP COLUMN IF EXISTS warehouse_lat,
    DROP COLUMN IF EXISTS warehouse_address;
