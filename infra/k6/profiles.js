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
export const stress = {
  vus: 100000,
  duration: "10m",
  thresholds,
};

export function profileFromEnv() {
  const name = __ENV.K6_PROFILE || "smoke";
  return { name, options: { smoke, load, stress }[name] || smoke };
}
