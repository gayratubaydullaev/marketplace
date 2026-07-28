const thresholds = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<800"],
};

export const smoke = {
  vus: 10,
  duration: "30s",
  thresholds,
};

export const load = {
  vus: 100,
  duration: "2m",
  thresholds,
};

// Artifact configuration for the 100,000 concurrent-user capacity target.
// Run only against dedicated, approved load-test infrastructure.
// Requires CONFIRM_STRESS=1 (enforced below and by `make k6-stress`).
export const stress = {
  stages: [
    { duration: "2m", target: 1000 },
    { duration: "3m", target: 10000 },
    { duration: "3m", target: 50000 },
    { duration: "2m", target: 100000 },
    { duration: "5m", target: 100000 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function profileFromEnv() {
  const name = __ENV.K6_PROFILE || "smoke";
  if (name === "stress" && __ENV.CONFIRM_STRESS !== "1") {
    throw new Error("Set CONFIRM_STRESS=1 to run the 100k VU stress profile");
  }
  return { name, options: { smoke, load, stress }[name] || smoke };
}
