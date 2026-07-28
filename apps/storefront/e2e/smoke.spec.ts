/**
 * Smoke e2e against a running local stack (storefront :3000).
 *
 *   E2E=1 pnpm --filter @gayrat/storefront test:e2e
 *
 * Does not hit live PSPs — only verifies the storefront boots.
 */
import { test, expect } from "@playwright/test";

test.describe("storefront smoke", () => {
  test.skip(!process.env.E2E, "set E2E=1 to run against local stack");

  test("home loads", async ({ page }) => {
    await page.goto("/uz");
    await expect(page.locator("body")).toBeVisible();
  });

  test("catalog route responds", async ({ page }) => {
    const res = await page.goto("/uz/products");
    expect(res?.ok() || res?.status() === 404).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });
});
