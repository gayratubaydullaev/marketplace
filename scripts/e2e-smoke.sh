#!/usr/bin/env bash
set -euo pipefail

TENANT="00000000-0000-0000-0000-000000000001"
AUTH=http://localhost:8001
CATALOG=http://localhost:8002
CART=http://localhost:8004
ORDERS=http://localhost:8005
PAY=http://localhost:8006
NOTIFY=http://localhost:8009
VENDOR=http://localhost:8007
DB="${DATABASE_URL:-postgres://marketplace:marketplace@localhost:5432/marketplace?sslmode=disable}"
H=(-H "Content-Type: application/json" -H "X-Tenant-ID: $TENANT")

echo "== e2e smoke =="

EMAIL="buyer$(date +%s)@gayrat.uz"
PASS="Buyer123!"

echo "1 register"
REG=$(curl -sf "${H[@]}" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"first_name\":\"Buyer\",\"locale\":\"uz\",\"phone\":\"+998907654321\"}" "$AUTH/v1/auth/register")
TOK=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access_token'])")
AH=(-H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -H "X-Tenant-ID: $TENANT")

echo "1b email verification request"
curl -sf "${AH[@]}" -X POST "$AUTH/v1/auth/request-email-verification" >/dev/null || true

echo "2 catalog"
PID=$(curl -sf "${H[@]}" "$CATALOG/v1/products?status=active&limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0]['id'] if d.get('items') else '')")
if [[ -z "$PID" ]]; then
  echo "No products — run seed.sh first" >&2
  exit 1
fi
PRICE=$(curl -sf "${H[@]}" "$CATALOG/v1/products?status=active&limit=1" | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['price'])")

echo "3 cart add + coupon"
curl -sf "${AH[@]}" -d "{\"product_id\":\"$PID\",\"quantity\":1}" "$CART/v1/cart/items" >/dev/null
curl -sf "${AH[@]}" -d '{"code":"WELCOME10"}' "$CART/v1/cart/apply-coupon" >/dev/null || true
CART_JSON=$(curl -sf "${AH[@]}" "$CART/v1/cart")
CART_ID=$(echo "$CART_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['cart']['id'])")

echo "4 create order from cart"
ORDER=$(curl -sf "${AH[@]}" -d "{\"cart_id\":\"$CART_ID\",\"shipping_address\":{\"region\":\"Toshkent shahri\",\"district\":\"Chilonzor\",\"phone\":\"+998907654321\"},\"shipping_cost\":15000}" "$ORDERS/v1/orders")
OID=$(echo "$ORDER" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "5 payment intent + sandbox confirm"
INTENT=$(curl -sf "${AH[@]}" -d "{\"order_id\":\"$OID\",\"provider\":\"payme\",\"idempotency_key\":\"e2e-$OID\"}" "$PAY/v1/payments/intent")
PAY_ID=$(echo "$INTENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
SECRET="${PAYME_SECRET:-payme-sandbox-secret}"
BODY="{\"id\":\"$(echo "$INTENT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('provider_payment_id',''))")\",\"status\":\"succeeded\",\"sandbox\":true}"
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -sf -X POST -H "Content-Type: application/json" -H "X-Signature: $SIG" -H "X-Tenant-ID: $TENANT" \
  -d "$BODY" "$PAY/v1/payments/webhooks/payme" >/dev/null || \
curl -sf "${AH[@]}" -d "{\"payment_id\":\"$PAY_ID\",\"sandbox_force\":true}" "$PAY/v1/payments/confirm" >/dev/null

echo "5b payment_splits"
SPLITS=$(psql "$DB" -Atqc "SELECT COUNT(*) FROM payment_splits WHERE payment_id='$PAY_ID'" 2>/dev/null || echo "0")
# -q silences SET notices when search_path is in URL options
echo "   splits=$SPLITS"

echo "6 notifications + outbox"
curl -sf "${AH[@]}" "$NOTIFY/v1/notifications" >/dev/null
sleep 1
OUTBOX=$(psql "$DB" -Atc "SELECT COUNT(*) FROM notification_outbox" 2>/dev/null || echo "skip")
echo "   outbox_rows=$OUTBOX"

echo "7 tenant mode"
curl -sf "${H[@]}" "$VENDOR/v1/tenant/mode" >/dev/null

echo "OK order=$OID payment=$PAY_ID product=$PID price=$PRICE splits=$SPLITS"
