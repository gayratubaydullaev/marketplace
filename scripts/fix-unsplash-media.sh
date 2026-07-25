#!/usr/bin/env bash
# Replace Unsplash product/banner URLs in local DB with storefront /public assets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
DB="${DATABASE_URL:?DATABASE_URL required}"
TENANT="${TENANT_ID:-00000000-0000-0000-0000-000000000001}"

psql "$DB" <<SQL
SET search_path TO marketplace;
-- FORCE RLS: must set tenant GUC to see/update rows.
SET app.current_tenant = '$TENANT';

UPDATE products
SET images = COALESCE((
  SELECT jsonb_agg(
    CASE
      WHEN value::text ~* 'images\.unsplash\.com'
        THEN to_jsonb(('/products/p' || ((abs(hashtext(COALESCE(value::text, id::text))) % 10) + 1)::text || '.svg'))
      ELSE value
    END
  )
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(images) = 'array' THEN images ELSE '[]'::jsonb END)
), '[]'::jsonb),
    updated_at = NOW()
WHERE images::text ILIKE '%unsplash%';

UPDATE product_variants
SET image_url = '/products/p' || ((abs(hashtext(COALESCE(image_url, id::text))) % 10) + 1)::text || '.svg'
WHERE image_url ILIKE '%unsplash%';

UPDATE product_variants
SET attributes = jsonb_set(
  COALESCE(attributes, '{}'::jsonb),
  '{images}',
  COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN value::text ~* 'images\.unsplash\.com'
          THEN to_jsonb(('/products/p' || ((abs(hashtext(COALESCE(value::text, id::text))) % 10) + 1)::text || '.svg'))
        ELSE value
      END
    )
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(attributes->'images') = 'array' THEN attributes->'images'
        ELSE '[]'::jsonb
      END
    )
  ), '[]'::jsonb)
)
WHERE attributes::text ILIKE '%unsplash%';

UPDATE hero_banners
SET image_url = CASE
  WHEN kind = 'promo' THEN '/hero/hero-promo.jpg'
  ELSE '/hero/hero-market.jpg'
END
WHERE image_url ILIKE '%unsplash%';

SELECT 'products_left' AS k, COUNT(*)::text AS v FROM products WHERE images::text ILIKE '%unsplash%'
UNION ALL
SELECT 'variants_left', COUNT(*)::text FROM product_variants WHERE image_url ILIKE '%unsplash%' OR attributes::text ILIKE '%unsplash%'
UNION ALL
SELECT 'banners_left', COUNT(*)::text FROM hero_banners WHERE image_url ILIKE '%unsplash%';
SELECT slug, images FROM products WHERE slug = 'erkak-futbolka';
SQL

echo "Unsplash media URLs rewritten to local /products and /hero assets."
