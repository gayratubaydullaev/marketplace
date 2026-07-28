import http from "k6/http";
import { check, sleep, group } from "k6";
import { profileFromEnv } from "./profiles.js";

/**
 * Checkout-oriented smoke/load against the gateway.
 * Uses public catalog + cart guest flows; does not complete live payments.
 *
 *   k6 run infra/k6/checkout.js
 *   K6_PROFILE=load k6 run infra/k6/checkout.js
 *   CONFIRM_STRESS=1 K6_PROFILE=stress k6 run infra/k6/checkout.js
 */
export const options = profileFromEnv().options;

const BASE = (__ENV.API_BASE || "http://localhost:8080").replace(/\/$/, "");
const TENANT = __ENV.TENANT_ID || "00000000-0000-0000-0000-000000000001";
const headers = {
  "X-Tenant-ID": TENANT,
  "Content-Type": "application/json",
  "X-Guest-ID": `k6-${__VU}-${__ITER}`,
};

export default function () {
  group("catalog", () => {
    const products = http.get(`${BASE}/v1/products?limit=10`, { headers });
    check(products, { "products 200": (r) => r.status === 200 });
  });

  group("cart", () => {
    const cart = http.get(`${BASE}/v1/cart`, { headers });
    check(cart, {
      "cart reachable": (r) => r.status === 200 || r.status === 404 || r.status === 401,
    });
  });

  group("payments providers", () => {
    const providers = http.get(`${BASE}/v1/payments/providers`, { headers });
    check(providers, {
      "providers public/auth": (r) => r.status === 200 || r.status === 401,
    });
  });

  group("search", () => {
    const search = http.get(`${BASE}/v1/search?q=a&limit=5`, { headers });
    check(search, {
      "search ok": (r) => r.status === 200 || r.status === 404 || r.status === 503,
    });
  });

  sleep(Number(__ENV.K6_SLEEP || 0.3));
}
