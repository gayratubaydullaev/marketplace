#!/usr/bin/env bash
# Set demo compare_at_price on existing products so cards show old price + −% badge.
set -euo pipefail

API_AUTH="${API_AUTH:-http://localhost:8001}"
API_CATALOG="${API_CATALOG:-http://localhost:8002}"
API="${API:-http://localhost:8080}"
TENANT="00000000-0000-0000-0000-000000000001"
HDR=(-H "Content-Type: application/json" -H "X-Tenant-ID: $TENANT")

echo "Login admin..."
TOK=$(curl -sf "${HDR[@]}" -d '{"email":"admin@gayrat.uz","password":"Admin123!"}' "$API_AUTH/v1/auth/login" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access_token'])")
AUTH=(-H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -H "X-Tenant-ID: $TENANT")

BASE="$API_CATALOG"
if curl -sf "${AUTH[@]}" "$API/v1/products?limit=1" >/dev/null 2>&1; then
  BASE="$API"
fi

export TOK TENANT BASE
curl -sf "${AUTH[@]}" "$BASE/v1/products?limit=100" | python3 -c '
import json,sys,hashlib,urllib.request,os
data=json.load(sys.stdin)
token=os.environ["TOK"]
tenant=os.environ["TENANT"]
base=os.environ["BASE"]
ok=0
for p in data.get("items") or []:
  slug=p.get("slug") or ""
  price=float(p.get("price") or 0)
  pid=p.get("id")
  if not pid or price<=0: continue
  sale_pct=(int(hashlib.md5((slug+":sale").encode()).hexdigest(),16)%17)+12
  featured=bool(p.get("is_featured"))
  if not (featured or sale_pct%2==0):
    continue
  compare=int(round(price*(100+sale_pct)/100/1000)*1000)
  if compare<=price:
    compare=int(price)+max(10000,int(price)//10)
  body=json.dumps({"compare_at_price": compare}).encode()
  req=urllib.request.Request(
    f"{base}/v1/products/{pid}",
    data=body,
    method="PUT",
    headers={
      "Authorization": f"Bearer {token}",
      "Content-Type": "application/json",
      "X-Tenant-ID": tenant,
    },
  )
  try:
    with urllib.request.urlopen(req) as res:
      print(f"  {slug}: {int(price)} → compare {compare} (−{sale_pct}%)")
      ok += 1
  except Exception as e:
    print(f"  {slug}: fail {e}")
print(f"updated {ok}")
'
