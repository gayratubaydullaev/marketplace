DROP INDEX IF EXISTS idx_hero_banners_tenant_kind;
ALTER TABLE hero_banners DROP COLUMN IF EXISTS kind;
