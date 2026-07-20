// Temporary dependency-free smoke check. Replace with the documented
// Playwright flow once @playwright/test is installed.
const baseURL = process.env.BASE_URL || "http://localhost:3000";

const response = await fetch(baseURL);
if (!response.ok) {
  throw new Error(`Storefront health check failed: ${response.status}`);
}

console.log(`Storefront responded with ${response.status}: ${baseURL}`);
