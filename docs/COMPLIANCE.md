# Security and compliance notes

This document records application controls; it is not a legal certification.

## Browser protections

- Kong sets a restrictive baseline CSP, HSTS, `X-Content-Type-Options`,
  `X-Frame-Options`, and `Referrer-Policy`. Any new third-party script, image,
  or payment redirect must be added to CSP deliberately.
- State-changing browser requests require an authenticated bearer token. If
  cookie-based authentication is introduced, add CSRF tokens and Origin/Referer
  validation before enabling it.
- Session and refresh cookies, if used, must be `Secure`, `HttpOnly`,
  `SameSite=Lax` (or `Strict` where compatible), scoped to the narrowest path,
  and have explicit expiration.

## Data handling

- Tenant data is isolated with PostgreSQL RLS; migrations force RLS for
  tenant-scoped tables. Production database roles must not own those tables.
- Do not place production payment data, access tokens, customer passwords, or
  signing keys in logs. Use a managed secret store in production.
- Validate retention, deletion, export, and breach-notification requirements
  with counsel for each operating jurisdiction.
# Compliance notes (§8.4)

## Privacy
- Storefront privacy policy: `/{locale}/privacy`
- Terms: `/{locale}/terms`
- Cookie banner: `CookieBanner` (localStorage `cookie_consent`)

## GDPR / personal data
- Export: `GET /v1/auth/export` (authenticated)
- Delete/anonymize: `DELETE /v1/auth/me`

## CSRF
- API is Bearer-token JSON API (not cookie session). CSRF risk is low for SPA+JWT.
- Cookie consent does not store session cookies.

## CSP
- Kong `response-transformer` sets baseline CSP. Tighten per-environment for Next.js inline scripts (nonce-based CSP recommended for production frontends).
