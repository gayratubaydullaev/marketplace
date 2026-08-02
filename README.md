# Gayrat Marketplace — Uzbekistan

Multi-vendor marketplace for Uzbekistan (`uz` / `ru` / `en` / `ar`), Go microservices + Next.js 15.

## Quick start (one command)

```bash
# Postgres must be reachable (see .env DATABASE_URL)
chmod +x scripts/dev-up.sh
./scripts/dev-up.sh
```

Opens:

| App | URL |
|-----|-----|
| Storefront | http://localhost:3000/uz |
| Admin | http://localhost:3001 |
| Vendor | http://localhost:3002 |
| Courier | http://localhost:3003 |
| API gateway | http://localhost:8080 |

```bash
./scripts/seed.sh          # sample vendors + products
./scripts/e2e-smoke.sh     # register → cart → order → pay (webhook)
```

Default admin: `admin@gayrat.uz` / `Admin123!`  
Vendor: `vendor@gayrat.uz` / `Vendor123!`  
Courier: `courier@gayrat.uz` / `Courier123!`  
Tenant: `00000000-0000-0000-0000-000000000001`

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, next-intl, Tailwind, Zustand |
| Backend | Go 1.24, Gin, sqlx, JWT RS256/HS256 |
| Data | PostgreSQL 16 (+ Citus path), Redis, Kafka, ES, ClickHouse, MinIO |
| Gateway | Kong or `scripts/dev-gateway` on :8080 |
| Payments | Sandbox redirect + webhook (no live money) |

## Manual steps (optional)

```bash
set -a && source .env && set +a
./scripts/run-services.sh
go run scripts/dev-gateway/main.go
pnpm dev:storefront   # :3000
pnpm dev:admin        # :3001
pnpm --filter @gayrat/vendor dev  # :3002
pnpm --filter @gayrat/delivery dev  # :3003
```

## Production notes

- Frontends use **only** `NEXT_PUBLIC_API_BASE` (gateway).
- Maps: `@gayrat/map` uses **Yandex Maps JS** when `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` is set; otherwise **Leaflet + OpenStreetMap** (`NEXT_PUBLIC_MAP_TILE_URL` optional). Courier deep-links include **Yandex Navigator** (`yandexnavi://`) plus Yandex Maps / Google. Geocoding stays server-side via `GET /v1/delivery/geo/search|reverse` (Nominatim + optional `YANDEX_GEOCODER_API_KEY`). Do not call geocoders from the browser.
- RS256: set `JWT_PRIVATE_KEY_PEM` / `JWT_PUBLIC_KEY_PEM`; JWKS at `/.well-known/jwks.json`.
- Migrations: `./scripts/migrate.sh` (RLS v4 + FX v5).
- Notifications: `NOTIFY_TRANSPORT=log|smtp` — default `log` writes to stdout; set `smtp` with `SMTP_URL` / `SMTP_FROM` for real email. Admin **Settings → Notifications → Test send** hits `POST /v1/notifications/test-send`.
- Monitoring: `infra/monitoring/docker-compose.monitoring.yml`
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Staging / Citus / Vault: [docs/STAGING.md](docs/STAGING.md)
  - `make citus-up` · `make citus-smoke`

## Payment flow

Checkout → intent (with `metadata.locale`) → provider checkout (sandbox or live) → return `/{locale}/orders/:id/payment-return` (poll).
Browser never sends `sandbox_force`. Live mode requires `PAYMENTS_SANDBOX=false` + PSP secrets.

Admin ops: **Mark as paid** (`POST /v1/payments/admin/mark-paid`) for bank/stuck intents; **Confirm PSP refund** (`POST /v1/payments/admin/confirm-refund`) after refunding in Payme/Click/Uzum/PayPal dashboard. COD/bank handoff uses `POST /v1/payments/collect`.

Sandbox PayPal works without credentials (HTML pay page). Stripe refunds resolve Checkout Session (`cs_…`) → PaymentIntent automatically.

## Known limits

**Implemented (local/staging):** order tax lines, cart inventory reservation, PDF/HTML invoice download, partial returns, PSP provider health panel, vendor balance snapshot, COD dispute workflow, delivery auto-assign (`POST /v1/admin/deliveries/:id/auto-assign`).

**Staging / prod only:**

- Live PSP settlement still needs merchant cabinet webhooks + secrets (`PAYMENTS_SANDBOX=false` + PSP env vars).
- 100k VU stress: `CONFIRM_STRESS=1 make k6-stress` on dedicated staging only.

**Other notes:**

- Carrier rates: `SHIPPING_PROVIDER=local|easypost|shipstation` (API keys optional; falls back to UZS flat rules).
- Review toxicity: local heuristics always; optional `TOXICITY_API_URL` for remote re-check.
- Docker Compose / Citus HA cluster are documented but not required for local demo.
- Full 20-locale message packs: structure ready; routed locales are `uz|ru|en|ar`.
- OTP codes are never returned in API responses unless `OTP_DEBUG=1` (even in dev/staging).
- Search falls back to PostgreSQL when Elasticsearch is down; check `GET /v1/search/health`.