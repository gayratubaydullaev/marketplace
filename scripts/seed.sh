#!/usr/bin/env bash
set -euo pipefail

API_AUTH="${API_AUTH:-http://localhost:8001}"
API_CATALOG="${API_CATALOG:-http://localhost:8002}"
API_VENDOR="${API_VENDOR:-http://localhost:8007}"
API_CART="${API_CART:-http://localhost:8004}"
TENANT="00000000-0000-0000-0000-000000000001"
HDR=(-H "Content-Type: application/json" -H "X-Tenant-ID: $TENANT")

CAT_ELEK="00000000-0000-0000-0000-000000000101"
CAT_KIYIM="00000000-0000-0000-0000-000000000102"
CAT_UY="00000000-0000-0000-0000-000000000103"
CAT_SMART="00000000-0000-0000-0000-000000000111"
CAT_NOTE="00000000-0000-0000-0000-000000000112"
CAT_AUDIO="00000000-0000-0000-0000-000000000113"
CAT_MEN="00000000-0000-0000-0000-000000000121"
CAT_WOMEN="00000000-0000-0000-0000-000000000122"
CAT_KIDS="00000000-0000-0000-0000-000000000123"
CAT_KITCHEN="00000000-0000-0000-0000-000000000131"
CAT_CLEAN="00000000-0000-0000-0000-000000000132"
CAT_HOME_TEX="00000000-0000-0000-0000-000000000133"

echo "Login admin..."
TOK=$(curl -sf "${HDR[@]}" -d '{"email":"admin@gayrat.uz","password":"Admin123!"}' "$API_AUTH/v1/auth/login" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access_token'])")
AUTH=(-H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -H "X-Tenant-ID: $TENANT")

create_vendor() {
  local email="$1" password="$2" first="$3" last="$4" phone="$5" name="$6" slug="$7" desc="$8"
  echo "Register vendor $email ($name)..." >&2
  curl -sf "${HDR[@]}" -d "{\"email\":\"$email\",\"password\":\"$password\",\"first_name\":\"$first\",\"last_name\":\"$last\",\"phone\":\"$phone\",\"locale\":\"uz\"}" \
    "$API_AUTH/v1/auth/register" >/dev/null || true

  local vtok
  vtok=$(curl -sf "${HDR[@]}" -d "{\"email\":\"$email\",\"password\":\"$password\"}" "$API_AUTH/v1/auth/login" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access_token'])")
  local -a vauth=(-H "Authorization: Bearer $vtok" -H "Content-Type: application/json" -H "X-Tenant-ID: $TENANT")

  local vid=""
  vid=$(curl -sf "${vauth[@]}" -d "{\"name\":\"$name\",\"slug\":\"$slug\",\"description\":\"$desc\",\"translations\":{\"uz\":{\"name\":\"$name\"},\"ru\":{\"name\":\"$name\"}}}" \
    "$API_VENDOR/v1/vendors/apply" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)

  if [[ -n "${vid}" ]]; then
    curl -sf "${AUTH[@]}" -X POST "$API_VENDOR/v1/admin/vendors/$vid/approve" >/dev/null || true
    echo "  vendor approved: $slug ($vid)" >&2
  else
    # resolve existing vendor by listing if apply returned empty
    vid=$(curl -sf "${AUTH[@]}" "$API_VENDOR/v1/admin/vendors" 2>/dev/null | python3 -c "
import sys,json
data=json.load(sys.stdin)
items=data.get('items') or data.get('vendors') or (data if isinstance(data,list) else [])
for v in items:
  if v.get('slug')=='$slug':
    print(v.get('id','')); break
" 2>/dev/null || true)
    echo "  vendor apply skipped for $slug (id=${vid:-n/a})" >&2
  fi
  printf '%s' "$vid"
}

create_product() {
  local vendor_id="$1" category_id="$2" slug="$3" name_uz="$4" name_ru="$5" desc_uz="$6" desc_ru="$7" price="$8" qty="$9" featured="${10:-false}"
  python3 - "$vendor_id" "$category_id" "$slug" "$name_uz" "$name_ru" "$desc_uz" "$desc_ru" "$price" "$qty" "$featured" <<'PY' | \
    curl -sf "${AUTH[@]}" -d @- "$API_CATALOG/v1/products" >/dev/null \
    && echo "  product: $slug" \
    || echo "  product skip/fail: $slug"
import json, sys, hashlib
vendor_id, category_id, slug, name_uz, name_ru, desc_uz, desc_ru, price, qty, featured = sys.argv[1:]
photos = {
  "samsung-a55": ["/products/prod-phone-samsung.jpg"],
  "xiaomi-redmi-note-13": ["/products/prod-phone-xiaomi.jpg"],
  "airpods-pro-2": ["/products/prod-earbuds.jpg"],
  "lenovo-ideapad-3": ["/products/prod-laptop.jpg"],
  "jbl-flip-6": ["/products/prod-speaker.jpg"],
  "atlas-kurtka": ["/products/prod-jacket.jpg"],
  "erkak-futbolka": ["/products/prod-tshirt.jpg", "/products/prod-tshirt.jpg"],
  "ayol-poyabzal": ["/products/prod-sneakers.jpg"],
  "bolalar-sviter": ["/products/prod-sweater.jpg"],
  "klassik-shim": ["/products/prod-trousers.jpg"],
  "blender-philips": ["/products/prod-blender.jpg"],
  "choynak-tefal": ["/products/prod-kettle.jpg"],
  "yostiq-set": ["/products/prod-pillows.jpg"],
  "tozalash-robot": ["/products/prod-robot-vac.jpg"],
  "non-pishirgich": ["/products/prod-breadmaker.jpg"],
}
n = (int(hashlib.md5(slug.encode()).hexdigest(), 16) % 10) + 1
imgs = photos.get(slug, [f"/products/p{n}.svg"])
price_i = int(price)
# Demo sale: ~12–28% off for featured / some SKUs so cards show old price + −% badge
sale_pct = (int(hashlib.md5((slug + ":sale").encode()).hexdigest(), 16) % 17) + 12
compare_at = None
if featured.lower() == "true" or sale_pct % 2 == 0:
  compare_at = int(round(price_i * (100 + sale_pct) / 100 / 1000) * 1000)
  if compare_at <= price_i:
    compare_at = price_i + max(10000, price_i // 10)
body = {
  "category_id": category_id,
  "slug": slug,
  "translations": {
    "uz": {"name": name_uz, "description": desc_uz},
    "ru": {"name": name_ru, "description": desc_ru},
  },
  "price": price_i,
  "currency": "UZS",
  "inventory_quantity": int(qty),
  "status": "active",
  "is_featured": featured.lower() == "true",
  "images": imgs,
}
if compare_at:
  body["compare_at_price"] = compare_at
if vendor_id:
  body["vendor_id"] = vendor_id
print(json.dumps(body))
PY
}

echo "=== Vendors ==="
VID1=$(create_vendor "vendor@gayrat.uz" "Vendor123!" "Ali" "Sotuvchi" "+998901112233" "Ali Shop" "ali-shop" "Elektronika")
VID2=$(create_vendor "dilshod@gayrat.uz" "Vendor123!" "Dilshod" "Karimov" "+998901112244" "Toshkent Style" "toshkent-style" "Kiyim va moda")
VID3=$(create_vendor "nilufar@gayrat.uz" "Vendor123!" "Nilufar" "Rahimova" "+998901112255" "Uy Comfort" "uy-comfort" "Uy-ro'zg'or")

echo
echo "=== Subcategories ==="
bash "$(dirname "$0")/seed-subcategories.sh" || true

echo
echo "=== Products ==="
# Ali Shop — electronics (leaf subcategories)
create_product "${VID1}" "$CAT_SMART" "samsung-a55" "Samsung Galaxy A55" "Samsung Galaxy A55" "128GB, 5G" "128GB, 5G" 4599000 25 true
create_product "${VID1}" "$CAT_SMART" "xiaomi-redmi-note-13" "Xiaomi Redmi Note 13" "Xiaomi Redmi Note 13" "8/256GB, AMOLED" "8/256GB, AMOLED" 2899000 40 true
create_product "${VID1}" "$CAT_AUDIO" "airpods-pro-2" "AirPods Pro 2" "AirPods Pro 2" "Shovqinni bostirish" "Шумоподавление" 3299000 15 true
create_product "${VID1}" "$CAT_NOTE" "lenovo-ideapad-3" "Lenovo IdeaPad 3" "Lenovo IdeaPad 3" "Ryzen 5, 16GB RAM" "Ryzen 5, 16GB RAM" 7499000 12 false
create_product "${VID1}" "$CAT_AUDIO" "jbl-flip-6" "JBL Flip 6" "JBL Flip 6" "Portativ kolonka" "Портативная колонка" 1899000 30 false

# Toshkent Style — clothing
create_product "${VID2}" "$CAT_MEN" "atlas-kurtka" "Qishki kurtka" "Зимняя куртка" "Issiq va qulay" "Тёплая и удобная" 899000 40 true
create_product "${VID2}" "$CAT_MEN" "erkak-futbolka" "Erkaklar futbolkasi" "Мужская футболка" "100% paxta" "100% хлопок" 149000 100 true
create_product "${VID2}" "$CAT_WOMEN" "ayol-poyabzal" "Ayollar krossovkalari" "Женские кроссовки" "Yengil va chiroyli" "Лёгкие и красивые" 459000 55 true
create_product "${VID2}" "$CAT_KIDS" "bolalar-sviter" "Bolalar sviteri" "Детский свитер" "Issiq to'qima" "Тёплая вязка" 199000 70 false
create_product "${VID2}" "$CAT_MEN" "klassik-shim" "Klassik shim" "Классические брюки" "Ofis uchun" "Для офиса" 329000 45 false

# Uy Comfort — home
create_product "${VID3}" "$CAT_KITCHEN" "blender-philips" "Philips blender" "Блендер Philips" "800W, 2 tezlik" "800W, 2 скорости" 799000 20 true
create_product "${VID3}" "$CAT_KITCHEN" "choynak-tefal" "Tefal choynak" "Чайник Tefal" "1.7L, po'lat" "1.7L, сталь" 449000 35 true
create_product "${VID3}" "$CAT_HOME_TEX" "yostiq-set" "Yostiq to'plami (2 dona)" "Набор подушек (2 шт)" "Gipoallergen" "Гипоаллергенные" 299000 60 false
create_product "${VID3}" "$CAT_CLEAN" "tozalash-robot" "Robot changyutgich" "Робот-пылесос" "Smart mapping" "Умная карта" 2499000 10 true
create_product "${VID3}" "$CAT_KITCHEN" "non-pishirgich" "Non pishirgich" "Хлебопечка" "12 dastur" "12 программ" 1299000 18 false

echo
echo "=== Demo gallery + variants (erkak-futbolka) ==="
PID=$(curl -sf "${AUTH[@]}" "$API_CATALOG/v1/products/erkak-futbolka" | python3 -c "import sys,json; print(json.load(sys.stdin).get('product',{}).get('id',''))" 2>/dev/null || true)
if [[ -n "${PID}" ]]; then
  curl -sf "${AUTH[@]}" -X POST "$API_CATALOG/v1/products/$PID/images" -d '{
    "urls": [
      "/products/prod-tshirt.jpg",
      "/products/prod-tshirt.jpg"
    ]
  }' >/dev/null && echo "  images attached" || echo "  images skip"

  # Full color × size matrix so Rang and O'lcham can be chosen independently
  while IFS= read -r body; do
    [[ -z "$body" ]] && continue
    curl -sf "${AUTH[@]}" -X POST "$API_CATALOG/v1/products/$PID/variants" -d "$body" >/dev/null || true
  done < <(python3 - "$PID" <<'PY'
import json, sys
pid = sys.argv[1]
colors = {
  "Qora": "/products/prod-tshirt.jpg",
  "Oq": "/products/prod-tshirt.jpg",
  "Ko'k": "/products/prod-tshirt.jpg",
}
sizes = ["M", "L", "XL"]
slug = {"Qora": "qora", "Oq": "oq", "Ko'k": "kok"}
for color, img in colors.items():
  for size in sizes:
    price = 159000 if size == "XL" else 149000
    print(json.dumps({
      "sku": f"futbolka-{slug[color]}-{size.lower()}",
      "title": f"{color} / {size}",
      "price": price,
      "inventory_quantity": 12 + abs(hash(color + size)) % 20,
      "image_url": img,
      "images": [img],
      "attributes": {"color": color, "size": size},
    }, ensure_ascii=False))
PY
)
  echo "  variants matrix seeded (3 colors × 3 sizes)"
else
  echo "  product erkak-futbolka not found, skip gallery demo"
fi

ADMIN_UID=$(curl -sf "${AUTH[@]}" "$API_AUTH/v1/auth/me" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -sf "${AUTH[@]}" -d "{\"label\":\"Uy\",\"full_name\":\"Admin Gayrat\",\"phone\":\"+998901234567\",\"region\":\"Toshkent shahri\",\"district\":\"Yunusobod\",\"street\":\"Amir Temur\",\"building\":\"1\"}" \
  "$API_CART/v1/addresses" >/dev/null || true

echo "=== Home banners ==="
curl -sf "${AUTH[@]}" -d '{"kind":"hero","image_url":"/hero/hero-market.jpg","cta_href":"/products","interval_sec":6,"sort_order":0,"active":true}' \
  "$API_CATALOG/v1/admin/hero-banners" >/dev/null \
  && echo "  hero banner seeded" || echo "  hero banner skip/fail"
curl -sf "${AUTH[@]}" -d '{"kind":"hero","image_url":"/hero/hero-delivery.jpg","cta_href":"/products","interval_sec":6,"sort_order":1,"active":true}' \
  "$API_CATALOG/v1/admin/hero-banners" >/dev/null \
  && echo "  hero banner 2 seeded" || echo "  hero banner 2 skip/fail"
curl -sf "${AUTH[@]}" -d '{"kind":"promo","image_url":"/hero/hero-promo.jpg","cta_href":"/products","interval_sec":8,"sort_order":0,"active":true}' \
  "$API_CATALOG/v1/admin/hero-banners" >/dev/null \
  && echo "  promo banner seeded" || echo "  promo banner skip/fail"

echo "=== Promotions ==="
curl -sf "${AUTH[@]}" -d '{"code":"WELCOME15","type":"percent","value":15,"min_order":50000,"status":"active"}' \
  "$API_CATALOG/v1/admin/coupons" >/dev/null \
  && echo "  coupon WELCOME15 seeded" || echo "  coupon skip/fail"
curl -sf "${AUTH[@]}" -d '{"code":"GIFT100K","balance":100000,"currency":"UZS","status":"active"}' \
  "$API_CATALOG/v1/admin/gift-certificates" >/dev/null \
  && echo "  gift GIFT100K seeded" || echo "  gift skip/fail"

echo
echo "=== Courier ==="
API_DELIVERY="${API_DELIVERY:-http://localhost:8013}"
if curl -sf "${AUTH[@]}" -d '{"email":"courier@gayrat.uz","password":"Courier123!","full_name":"Jasur Kuryer","phone":"+998901000777","vehicle_type":"bike","approve":true}' \
  "$API_DELIVERY/v1/admin/couriers" >/dev/null; then
  echo "  courier@gayrat.uz created/approved via API"
else
  echo "  courier API seed skip — applying SQL seed if DB available"
  if [[ -f "$(dirname "$0")/../.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$(dirname "$0")/../.env"
    set +a
  fi
  DB="${DATABASE_URL:-postgres://marketplace:marketplace@localhost:5432/marketplace?sslmode=disable}"
  psql "$DB" -v ON_ERROR_STOP=0 -f "$(dirname "$0")/../services/delivery/migrations/000002_seed_courier.up.sql" >/dev/null \
    && echo "  courier SQL seed applied" || echo "  courier seed skip/fail"
fi

echo
echo "Seed done."
echo "  Vendors: ali-shop=${VID1:-n/a}, toshkent-style=${VID2:-n/a}, uy-comfort=${VID3:-n/a}"
echo "  Admin user id=${ADMIN_UID}"
echo "  Logins: admin@gayrat.uz / Admin123!"
echo "          vendor@gayrat.uz | dilshod@gayrat.uz | nilufar@gayrat.uz / Vendor123!"
echo "          courier@gayrat.uz / Courier123!"
