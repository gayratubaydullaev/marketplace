import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 200 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = __ENV.API_BASE || "http://localhost:8001";
const TENANT = "00000000-0000-0000-0000-000000000001";

export default function () {
  const res = http.get(`${BASE}/health`, {
    headers: { "X-Tenant-ID": TENANT },
  });
  check(res, { "health 200": (r) => r.status === 200 });
  sleep(0.2);
}
