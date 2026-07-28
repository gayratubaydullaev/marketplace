# Staging / HA runbook

Operational checklist for Citus sharding, External Secrets, and recovery targets
from `docs/SECURITY.md`.

## 1. Citus staging cluster

```bash
chmod +x scripts/citus-up.sh scripts/citus-smoke.sh
./scripts/citus-up.sh                 # start coordinator :5434 + 2 workers, bootstrap
CITUS_MIGRATE=1 ./scripts/citus-up.sh # also run migrate.sh against coordinator
./scripts/citus-smoke.sh              # nodes + distributed tables
```

App traffic:

```bash
export DATABASE_URL='postgres://marketplace:marketplace@localhost:5434/marketplace?sslmode=disable'
./scripts/run-services.sh
```

Rules:
- Always filter distributed tables by `tenant_id`.
- No cross-tenant JOINs on sharded tables.
- Categories / FX / tenants are reference tables (replicated).

See also: `infra/docker/citus-notes.md`, `infra/docker/citus-bootstrap.sql`.

## 2. External Secrets + Vault

Prereqs: External Secrets Operator installed in cluster.

1. Put secrets in Vault KV v2 at `secret/gayrat/marketplace` (keys listed in
   `infra/k8s/vault-keys.example.yaml`).
2. Enable in Helm values:

```yaml
externalSecrets:
  enabled: true
  vault:
    server: https://vault.example.com
    role: marketplace
```

3. Deploy chart — creates `ClusterSecretStore` + `ExternalSecret` which syncs
   into `marketplace-secrets` used by all service Deployments.

Fallback (non-Vault): `kubectl apply -f infra/k8s/secrets.example.yaml` with
rotated values (never commit real secrets).

## 3. RTO / RPO targets (prove on staging)

| Target | Goal | How to prove |
|--------|------|--------------|
| RTO | < 15m | Kill primary / coordinator; restore from snapshot or promote replica; apps reconnect |
| RPO | < 1m | Continuous WAL / AOF; measure last committed order vs restored DB |

Suggested drill (automated helper):

```bash
make rto-drill                 # DRILL_MODE=postgres (default)
DRILL_MODE=citus make rto-drill
```

Manual steps the script guides:
1. Seed orders on staging.
2. Note latest `orders.created_at`.
3. Simulate failure (postgres or citus coordinator stop).
4. Restore / promote; record wall-clock until healthy.
5. Log under `logs/rto-rpo-drill-*.log`.

HA compose reference: `infra/docker/docker-compose.ha.yml` (replica profile +
Citus profile + Redis sentinel).

## 4. Load / 100k path

```bash
make k6-health
make k6-checkout              # smoke vs gateway checkout path
make k6-load                  # catalog load profile
CONFIRM_STRESS=1 make k6-stress   # dedicated staging only
```

Run stress on dedicated staging hardware, never against production PSPs
(`PAYMENTS_SANDBOX=true`).

## 5. Staging gate before prod

- [ ] `./scripts/citus-up.sh` + `./scripts/citus-smoke.sh` green
- [ ] ExternalSecrets syncs `marketplace-secrets` (or manual secret applied)
- [ ] `PAYMENTS_SANDBOX=false` only with live secrets + webhook URLs
- [ ] OTel collector receives spans (`OTEL_EXPORTER_OTLP_ENDPOINT`)
- [ ] RTO/RPO drill logged (`make rto-drill`)
- [ ] k6 catalog + checkout smoke passed
- [ ] `make pentest` + `make webhook-replay` green
