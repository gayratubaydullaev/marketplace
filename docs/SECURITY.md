# Security checklist (OWASP + TZ §8)

Automated stand gates: `./scripts/pentest-gates.sh` · detailed matrix: `docs/PENTEST_CHECKLIST.md`

## Implemented

### Auth / identity
- Parameterized SQL (sqlx)
- JWT: **RS256** when `JWT_PRIVATE_KEY_PEM` / `JWT_PUBLIC_KEY_PEM` set; HS256 fallback for local/dev (`JWT_SECRET`)
- Reject `alg=none` and HS256-when-RS256 (alg confusion)
- JWKS at `/.well-known/jwks.json` and `/v1/auth/jwks`
- Login brute-force lockout via Redis (**5** fails / 15m)
- Refresh token rotation + revoke on logout; optional device fingerprint (`X-Device-Fingerprint`)
- OTP (SMS Twilio/Eskiz + email): codes omitted in production; **1/min · 5/hour** per destination → 429
- OAuth: Google + Apple + Facebook (dev bypass only outside production)
- Password bcrypt min 8 chars
- GDPR export/delete: `GET /v1/auth/export`, `DELETE /v1/auth/me`

### Tenancy / IDOR
- `X-Tenant-ID` + Postgres RLS GUC `app.current_tenant`
- **Strict FORCE RLS** (`infra/docker/migrate_v6_rls_strict.sql`) — unset tenant denied
- Forged `X-Tenant-ID` ≠ JWT tenant → 403; JWT tenant reapplied to RLS
- Guest orders require matching `X-Guest-ID` (order metadata)
- Vendors: orders/products scoped to own `vendor_id`
- Payments intent/list/status scoped to order owner (or guest / admin)
- Reviews + media scoped by `tenant_id`; review reply requires matching vendor

### API / gateway
- Rate limiting (Redis app-level + Kong `rate-limiting` 100/min IP)
- CORS allowlist only (`CORS_ORIGINS` / Kong / dev-gateway — no `*` with credentials)
- Body size limit 10 MiB (`MaxBodyBytes` + Kong `request-size-limiting`)
- Security headers on services + gateway: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy (+ HSTS via Kong)
- Search `/reindex` and `/analytics` require admin JWT
- Correlation IDs + OTel middleware hooks; Jaeger in monitoring compose
- Audit log package (`packages/go-common/audit`) + `audit_logs` table

### Payments
- Providers: Payme, Click, Uzum, Stripe (+ Connect metadata), PayPal, bank_transfer
- Idempotency keys unique per tenant; per-provider webhook HMAC/signature verify
- Empty signatures rejected when `PAYMENTS_SANDBOX=false`
- Bank transfer webhooks never auto-confirm (manual admin path)
- Sandbox default (`PAYMENTS_SANDBOX!=false`); live needs secrets + CI gate
- Split ledger in `payment_splits`; payout statuses: pending/processing/completed/failed

### Frontend / supply chain
- Admin / vendor `AuthGate` role checks; cookie consent before non-essential cookies
- No secrets in client bundles (`NEXT_PUBLIC_*` = public URLs/DSN only)
- Secrets example: ExternalSecrets/Vault templates; `.env.example` placeholders only
- CI: `govulncheck`, `pnpm audit`, Trivy fs scan, Dependabot

## Still ops / staging (out of repo apply scope)

- [ ] `terraform apply` + EKS with real IAM/subnets
- [ ] Vault / External Secrets operator live in cluster
- [ ] Quarterly external pen-test + ZAP authenticated crawl (see `docs/PENTEST_CHECKLIST.md`)
- [ ] Expand IDOR matrix for every new object endpoint each release
- [ ] Live webhook replay against each PSP sandbox account
- [ ] Citus multi-worker proven on staging (`--profile citus`)
- [ ] Multi-AZ RTO < 15m / RPO < 1m proven on staging
- [ ] Load-test stress profile (100k VUs) on dedicated hardware
