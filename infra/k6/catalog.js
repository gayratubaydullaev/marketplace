import http from "k6/http";
import { check, sleep } from "k6";
import { profileFromEnv } from "./profiles.js";

export const options = profileFromEnv().options;

const CATALOG = __ENV.CATALOG_BASE || "http://localhost:8002";
const TENANT = "00000000-0000-0000-0000-000000000001";

export default function () {
  const res = http.get(`${CATALOG}/v1/products?limit=20`, {
    headers: { "X-Tenant-ID": TENANT },
  });
  check(res, { "products 200": (r) => r.status === 200 });
  sleep(0.1);
}
