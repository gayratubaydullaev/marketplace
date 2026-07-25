ALTER TABLE hero_banners
    DROP COLUMN IF EXISTS interval_sec,
    DROP COLUMN IF EXISTS starts_at,
    DROP COLUMN IF EXISTS ends_at;
