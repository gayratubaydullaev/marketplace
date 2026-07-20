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
| API gateway | http://localhost:8080 |

```bash
./scripts/seed.sh          # sample vendors + products
./scripts/e2e-smoke.sh     # register → cart → order → pay (webhook)
```

Default admin: `admin@gayrat.uz` / `Admin123!`  
Vendor: `vendor@gayrat.uz` / `Vendor123!`  
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
```

## Production notes

- Frontends use **only** `NEXT_PUBLIC_API_BASE` (gateway).
- RS256: set `JWT_PRIVATE_KEY_PEM` / `JWT_PUBLIC_KEY_PEM`; JWKS at `/.well-known/jwks.json`.
- Migrations: `./scripts/migrate.sh` (RLS v4 + FX v5).
- Monitoring: `infra/monitoring/docker-compose.monitoring.yml`
- Security: [docs/SECURITY.md](docs/SECURITY.md)

## Payment flow

Checkout → intent → sandbox pay page → return `/orders/:id/payment-return` (poll). Browser never sends `sandbox_force`.

## Known limits

- Payments are **sandbox** (Payme/Click-shaped); no live merchant settlement.
- Docker Compose / Citus HA cluster are documented but not required for local demo.
- Full 20-locale message packs: structure ready; routed locales are `uz|ru|en|ar`.
