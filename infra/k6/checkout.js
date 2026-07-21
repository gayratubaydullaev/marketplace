import http from "k6/http";
import { check, sleep } from "k6";
import { profileFromEnv } from "./profiles.js";

export const options = profileFromEnv().options;

const TENANT = "00000000-0000-0000-0000-000000000001";
const BASE = __ENV.API_BASE || "http://localhost:8080";

export default function () {
  const headers = { "X-Tenant-ID": TENANT, "Content-Type": "application/json" };
  const health = http.get(`${BASE.replace(":8080", ":8001")}/health`);
  check(health, { "auth health": (r) => r.status === 200 });
  const products = http.get(`${BASE}/v1/products?limit=5`, { headers });
  check(products, { "products 200": (r) => r.status === 200 });
  sleep(0.5);
}
