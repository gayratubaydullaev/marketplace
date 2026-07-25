#!/usr/bin/env bash
# Seed nested subcategories and move demo products onto leaf categories.
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

CAT_ELEK="00000000-0000-0000-0000-000000000101"
CAT_KIYIM="00000000-0000-0000-0000-000000000102"
CAT_UY="00000000-0000-0000-0000-000000000103"

# Subcategory IDs (stable for demo)
CAT_SMART="00000000-0000-0000-0000-000000000111"
CAT_NOTE="00000000-0000-0000-0000-000000000112"
CAT_AUDIO="00000000-0000-0000-0000-000000000113"
CAT_MEN="00000000-0000-0000-0000-000000000121"
CAT_WOMEN="00000000-0000-0000-0000-000000000122"
CAT_KIDS="00000000-0000-0000-0000-000000000123"
CAT_KITCHEN="00000000-0000-0000-0000-000000000131"
CAT_CLEAN="00000000-0000-0000-0000-000000000132"
CAT_HOME_TEX="00000000-0000-0000-0000-000000000133"

psql "$DB" <<SQL
SET search_path TO marketplace;
SET app.current_tenant = '$TENANT';

INSERT INTO categories (id, tenant_id, parent_id, slug, translations, sort_order, status, image_url) VALUES
('$CAT_SMART', '$TENANT', '$CAT_ELEK', 'smartfonlar',
 '{"uz":{"name":"Smartfonlar"},"ru":{"name":"Смартфоны"},"en":{"name":"Smartphones"},"ar":{"name":"هواتف"}}', 1, 'active',
 '/products/prod-phone-xiaomi.jpg'),
('$CAT_NOTE', '$TENANT', '$CAT_ELEK', 'noutbuklar',
 '{"uz":{"name":"Noutbuklar"},"ru":{"name":"Ноутбуки"},"en":{"name":"Laptops"},"ar":{"name":"حواسيب"}}', 2, 'active',
 '/products/prod-laptop.jpg'),
('$CAT_AUDIO', '$TENANT', '$CAT_ELEK', 'audio',
 '{"uz":{"name":"Audio"},"ru":{"name":"Аудио"},"en":{"name":"Audio"},"ar":{"name":"صوتيات"}}', 3, 'active',
 '/products/prod-earbuds.jpg'),
('$CAT_MEN', '$TENANT', '$CAT_KIYIM', 'erkaklar',
 '{"uz":{"name":"Erkaklar"},"ru":{"name":"Мужчинам"},"en":{"name":"Men"},"ar":{"name":"رجال"}}', 1, 'active',
 '/products/prod-tshirt.jpg'),
('$CAT_WOMEN', '$TENANT', '$CAT_KIYIM', 'ayollar',
 '{"uz":{"name":"Ayollar"},"ru":{"name":"Женщинам"},"en":{"name":"Women"},"ar":{"name":"نساء"}}', 2, 'active',
 '/products/prod-sneakers.jpg'),
('$CAT_KIDS', '$TENANT', '$CAT_KIYIM', 'bolalar',
 '{"uz":{"name":"Bolalar"},"ru":{"name":"Детям"},"en":{"name":"Kids"},"ar":{"name":"أطفال"}}', 3, 'active',
 '/products/prod-sweater.jpg'),
('$CAT_KITCHEN', '$TENANT', '$CAT_UY', 'oshxona',
 '{"uz":{"name":"Oshxona"},"ru":{"name":"Кухня"},"en":{"name":"Kitchen"},"ar":{"name":"مطبخ"}}', 1, 'active',
 '/products/prod-blender.jpg'),
('$CAT_CLEAN', '$TENANT', '$CAT_UY', 'tozalash',
 '{"uz":{"name":"Tozalash"},"ru":{"name":"Уборка"},"en":{"name":"Cleaning"},"ar":{"name":"تنظيف"}}', 2, 'active',
 '/products/prod-robot-vac.jpg'),
('$CAT_HOME_TEX', '$TENANT', '$CAT_UY', 'tekstil',
 '{"uz":{"name":"Tekstil"},"ru":{"name":"Текстиль"},"en":{"name":"Textiles"},"ar":{"name":"منسوجات"}}', 3, 'active',
 '/products/prod-pillows.jpg')
ON CONFLICT (id) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  slug = EXCLUDED.slug,
  translations = EXCLUDED.translations,
  sort_order = EXCLUDED.sort_order,
  image_url = EXCLUDED.image_url,
  status = 'active';

-- Root categories on the homepage rail
UPDATE categories SET image_url = '/products/prod-phone-samsung.jpg' WHERE id = '$CAT_ELEK';
UPDATE categories SET image_url = '/products/prod-jacket.jpg' WHERE id = '$CAT_KIYIM';
UPDATE categories SET image_url = '/products/prod-kettle.jpg' WHERE id = '$CAT_UY';

UPDATE products SET category_id = '$CAT_SMART', updated_at = NOW() WHERE slug IN ('samsung-a55', 'xiaomi-redmi-note-13');
UPDATE products SET category_id = '$CAT_NOTE', updated_at = NOW() WHERE slug IN ('lenovo-ideapad-3');
UPDATE products SET category_id = '$CAT_AUDIO', updated_at = NOW() WHERE slug IN ('airpods-pro-2', 'jbl-flip-6');
UPDATE products SET category_id = '$CAT_MEN', updated_at = NOW() WHERE slug IN ('atlas-kurtka', 'erkak-futbolka', 'klassik-shim');
UPDATE products SET category_id = '$CAT_WOMEN', updated_at = NOW() WHERE slug IN ('ayol-poyabzal');
UPDATE products SET category_id = '$CAT_KIDS', updated_at = NOW() WHERE slug IN ('bolalar-sviter');
UPDATE products SET category_id = '$CAT_KITCHEN', updated_at = NOW() WHERE slug IN ('blender-philips', 'choynak-tefal', 'non-pishirgich');
UPDATE products SET category_id = '$CAT_CLEAN', updated_at = NOW() WHERE slug IN ('tozalash-robot');
UPDATE products SET category_id = '$CAT_HOME_TEX', updated_at = NOW() WHERE slug IN ('yostiq-set');

SELECT slug, image_url FROM categories WHERE tenant_id = '$TENANT' AND status = 'active' ORDER BY sort_order, slug;
SQL

echo "Subcategories seeded (with images) and products reassigned."
