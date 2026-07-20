# Security checklist (OWASP + TZ §8)

## Implemented
- Parameterized SQL (sqlx)
- JWT: **RS256** when `JWT_PRIVATE_KEY_PEM` / `JWT_PUBLIC_KEY_PEM` set; HS256 fallback for local/dev (`JWT_SECRET`)
- JWKS at `/.well-known/jwks.json` and `/v1/auth/jwks`
- Login brute-force lockout via Redis (10 fails / 15m)
- Rate limiting (Redis app-level + Kong `rate-limiting` plugin)
- CORS + `X-Tenant-ID` + Postgres RLS GUC `app.current_tenant`
- **FORCE ROW LEVEL SECURITY** + `marketplace_app` role (`infra/docker/migrate_v4_rls.sql`)
- Password bcrypt min 8 chars
- Payment idempotency keys + webhook HMAC (sandbox providers)
- Sandbox pay page redirect flow (no `sandbox_force` in browser UI)
- OAuth: Google ID token verified; Apple/Facebook require `OAUTH_DEV_BYPASS=1` only when `APP_ENV!=production`
- Email verification tokens (DB + Redis)
- OTP codes omitted from API responses when `APP_ENV=production`
- GDPR export/delete: `GET /v1/auth/export`, `DELETE /v1/auth/me`
- Kong security response headers (HSTS, CSP, X-Frame-Options)
- Secrets example: `infra/k8s/secrets.example.yaml`; `.env.example` placeholders only
- Correlation IDs: `X-Request-ID` / `X-Correlation-ID` middleware

## Payments honesty
Sandbox adapters only (Payme/Click/Uzum/Stripe-shaped). Redirect → sandbox pay page → mark paid (webhook-compatible). No live money. Split ledger in `payment_splits`. Payouts may be `paid_sandbox`.

## Still backlog for full TZ scale
- [ ] Live Payme/Click merchant credentials
- [ ] Vault / External Secrets operator wired in cluster
- [ ] Quarterly pen-test (see `docs/PENTEST_CHECKLIST.md`)
- [ ] Citus production cluster (see `infra/docker/citus-notes.md`)
- [ ] Multi-AZ RTO < 15m / RPO < 1m proven on staging
