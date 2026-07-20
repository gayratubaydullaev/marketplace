/**
 * Playwright e2e outline (install @playwright/test when ready):
 * 1. Open /uz → add product to cart
 * 2. Register / login
 * 3. Checkout → redirect to sandbox pay → confirm
 * 4. Land on payment-return → order paid
 *
 * Run (after pnpm add -D @playwright/test):
 *   pnpm exec playwright test apps/storefront/e2e/smoke.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("checkout smoke", () => {
  test.skip(!process.env.E2E, "set E2E=1 to run against local stack");

  test("home loads", async ({ page }) => {
    await page.goto(process.env.STOREFRONT_URL || "http://localhost:3000/uz");
    await expect(page.locator("body")).toBeVisible();
  });
});
