ALTER TABLE hero_banners
    ADD COLUMN IF NOT EXISTS interval_sec INTEGER NOT NULL DEFAULT 6,
    ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN hero_banners.interval_sec IS 'Carousel dwell time in seconds for this slide';
COMMENT ON COLUMN hero_banners.starts_at IS 'Optional: banner visible from this time';
COMMENT ON COLUMN hero_banners.ends_at IS 'Optional: banner visible until this time';
