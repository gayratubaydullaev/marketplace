# Security checklist (OWASP + TZ §8)

## Implemented
- Parameterized SQL (sqlx)
- JWT: **RS256** when `JWT_PRIVATE_KEY_PEM` / `JWT_PUBLIC_KEY_PEM` set; HS256 fallback for local/dev (`JWT_SECRET`)
- JWKS at `/.well-known/jwks.json` and `/v1/auth/jwks`
- Login brute-force lockout via Redis (10 fails / 15m)
- Refresh token rotation + optional device fingerprint (`X-Device-Fingerprint`)
- Rate limiting (Redis app-level + Kong `rate-limiting` plugin)
- CORS allowlist (`CORS_ORIGINS` / Kong origins — no `*` with credentials)
- `X-Tenant-ID` + Postgres RLS GUC `app.current_tenant`
- **Strict FORCE RLS** (`infra/docker/migrate_v6_rls_strict.sql`) — no NULL-tenant bypass
- Audit log package (`packages/go-common/audit`) + `audit_logs` table
- Password bcrypt min 8 chars
- Payment providers: Payme, Click, Uzum, Stripe (+ Connect metadata), PayPal, bank_transfer
- Idempotency keys + per-provider webhook verification; sandbox when `PAYMENTS_SANDBOX!=false`
- OAuth: Google + Apple + Facebook (dev bypass only outside production)
- OTP via Twilio/Eskiz SMS adapters; codes omitted in production responses
- GDPR export/delete: `GET /v1/auth/export`, `DELETE /v1/auth/me`
- Kong security response headers (HSTS, CSP, X-Frame-Options)
- Search `/reindex` and `/analytics` require admin JWT
- Secrets example: ExternalSecrets/Vault templates; `.env.example` placeholders only
- Correlation IDs + OTel middleware hooks; Jaeger in monitoring compose

## Payments
Live adapters are wired; enable with `PAYMENTS_SANDBOX=false` and real merchant keys.
Local/CI keep sandbox. Split ledger in `payment_splits`. Payout statuses: pending/processing/completed/failed.

## Still ops / staging (out of repo apply scope)
- [ ] `terraform apply` + EKS with real IAM/subnets
- [ ] Vault / External Secrets operator live in cluster
- [ ] Quarterly pen-test execution (see `docs/PENTEST_CHECKLIST.md`)
- [ ] Citus multi-worker proven on staging (`--profile citus`)
- [ ] Multi-AZ RTO < 15m / RPO < 1m proven on staging
- [ ] Load-test stress profile (100k VUs) on dedicated hardware
