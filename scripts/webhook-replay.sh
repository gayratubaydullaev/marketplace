#!/usr/bin/env bash
# Replay sandbox-shaped webhooks against local/staging payments (authorized stands only).
# Does NOT call live Payme/Click/Stripe merchant APIs — only our gateway webhook endpoints.
set -euo pipefail
API="${API_BASE:-http://localhost:8080}"
TENANT="${TENANT_ID:-00000000-0000-0000-0000-000000000001}"
SECRET="${WEBHOOK_HMAC_SECRET:-payme-sandbox-secret}"
PASS=0
FAIL=0

sign() {
  python3 - "$SECRET" <<'PY'
import hmac, hashlib, sys
secret = sys.argv[1].encode()
body = sys.stdin.buffer.read()
print(hmac.new(secret, body, hashlib.sha256).hexdigest())
PY
}

post_wh() {
  local provider="$1" body="$2" expect="$3"
  local sig code
  sig=$(printf '%s' "$body" | sign)
  code=$(curl -s -o /tmp/wh_body -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: $TENANT" \
    -H "X-Signature: $sig" \
    -d "$body" \
    "$API/v1/payments/webhooks/$provider" || true)
  if [[ "$code" == "$expect" ]]; then
    echo "OK  [$code] $provider webhook"
    PASS=$((PASS + 1))
  else
    echo "FAIL [$code!=$expect] $provider webhook"
    head -c 200 /tmp/wh_body; echo
    FAIL=$((FAIL + 1))
  fi
}

echo "== Webhook replay vs $API (sandbox HMAC) =="
echo "Ensure PAYMENTS_SANDBOX=true on payments-service"

# Unknown provider payment id → accepted but unmatched (or 401 if live)
post_wh payme '{"id":"payme_replay_missing","status":"succeeded"}' "200" || true
post_wh click '{"id":"click_replay_missing","status":"succeeded"}' "200" || true
post_wh uzum '{"id":"uzum_replay_missing","status":"succeeded"}' "200" || true
post_wh stripe '{"id":"pi_replay_missing","status":"succeeded"}' "200" || true

# Invalid signature must fail
code=$(curl -s -o /tmp/wh_bad -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" -H "X-Tenant-ID: $TENANT" \
  -H "X-Signature: deadbeef" \
  -d '{"id":"x","status":"succeeded"}' \
  "$API/v1/payments/webhooks/payme" || true)
if [[ "$code" == "401" || "$code" == "400" ]]; then
  echo "OK  [$code] bad signature rejected"
  PASS=$((PASS + 1))
else
  echo "FAIL [$code] bad signature rejected"
  FAIL=$((FAIL + 1))
fi

# Optional: replay for a known provider_payment_id from prior e2e
if [[ -n "${PROVIDER_PAYMENT_ID:-}" ]]; then
  body="{\"id\":\"$PROVIDER_PAYMENT_ID\",\"status\":\"succeeded\"}"
  post_wh "${PROVIDER:-payme}" "$body" "200"
fi

echo ""
echo "Passed: $PASS  Failed: $FAIL"
echo "Tip: run scripts/e2e-smoke.sh then PROVIDER_PAYMENT_ID=... $0"
[[ "$FAIL" -eq 0 ]]
