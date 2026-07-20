# Storefront smoke flow

Playwright is not currently installed in the workspace. When it is added, use
this flow as `apps/storefront/e2e/smoke.spec.ts`:

1. Start the storefront and API services with seeded catalog data.
2. Open `/uz`, assert the catalog is visible, and open a product.
3. Add the product to the cart and confirm the cart count and line item.
4. Register or log in a test buyer, then open checkout.
5. Submit a shipping address and create an order using the sandbox payment
   provider.
6. Confirm the payment-return page shows a successful sandbox status and the
   order appears in the buyer's order history.

Set `BASE_URL`, `E2E_EMAIL`, and `E2E_PASSWORD` in the test environment. Use
dedicated test tenants and sandbox payment credentials; do not run this flow
against live payment providers.
