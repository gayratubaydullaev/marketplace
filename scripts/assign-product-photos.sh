#!/usr/bin/env bash
# Assign local product photos to every catalog product (demo stand).
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
SET app.current_tenant = '$TENANT';

UPDATE products SET images = '["/products/prod-phone-samsung.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'samsung-a55';
UPDATE products SET images = '["/products/prod-phone-xiaomi.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'xiaomi-redmi-note-13';
UPDATE products SET images = '["/products/prod-earbuds.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'airpods-pro-2';
UPDATE products SET images = '["/products/prod-laptop.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'lenovo-ideapad-3';
UPDATE products SET images = '["/products/prod-speaker.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'jbl-flip-6';
UPDATE products SET images = '["/products/prod-jacket.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'atlas-kurtka';
UPDATE products SET images = '["/products/prod-tshirt.jpg","/products/prod-tshirt.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'erkak-futbolka';
UPDATE products SET images = '["/products/prod-sneakers.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'ayol-poyabzal';
UPDATE products SET images = '["/products/prod-sweater.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'bolalar-sviter';
UPDATE products SET images = '["/products/prod-trousers.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'klassik-shim';
UPDATE products SET images = '["/products/prod-blender.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'blender-philips';
UPDATE products SET images = '["/products/prod-kettle.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'choynak-tefal';
UPDATE products SET images = '["/products/prod-pillows.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'yostiq-set';
UPDATE products SET images = '["/products/prod-robot-vac.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'tozalash-robot';
UPDATE products SET images = '["/products/prod-breadmaker.jpg"]'::jsonb, updated_at = NOW() WHERE slug = 'non-pishirgich';

-- Any remaining products without images get a deterministic local placeholder.
UPDATE products
SET images = jsonb_build_array(
  '/products/p' || ((abs(hashtext(slug)) % 10) + 1)::text || '.svg'
),
    updated_at = NOW()
WHERE images IS NULL
   OR images = '[]'::jsonb
   OR jsonb_typeof(images) <> 'array'
   OR jsonb_array_length(images) = 0;

-- Futbolka variants: use the t-shirt photo
UPDATE product_variants pv
SET image_url = '/products/prod-tshirt.jpg',
    attributes = CASE
      WHEN pv.attributes ? 'images' THEN jsonb_set(pv.attributes, '{images}', '["/products/prod-tshirt.jpg"]'::jsonb)
      ELSE pv.attributes
    END
FROM products p
WHERE p.id = pv.product_id AND p.slug = 'erkak-futbolka';

SELECT slug, images FROM products ORDER BY slug;
SQL

echo "All product photos updated."
