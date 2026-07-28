# Gayrat Marketplace Makefile

export PATH := $(HOME)/.local/go/bin:$(PATH)
SERVICES := auth catalog search cart orders payments vendor reviews notifications analytics media realtime delivery

.PHONY: infra-up infra-down citus-up citus-smoke tidy build run-auth run-all frontend-install frontend-dev seed k6-health k6-load k6-stress k6-checkout pentest webhook-replay rto-drill

infra-up:
	docker compose -f infra/docker/docker-compose.dev.yml up -d

infra-down:
	docker compose -f infra/docker/docker-compose.dev.yml down

citus-up:
	chmod +x scripts/citus-up.sh scripts/citus-smoke.sh
	./scripts/citus-up.sh

citus-smoke:
	chmod +x scripts/citus-smoke.sh
	./scripts/citus-smoke.sh

pentest:
	chmod +x scripts/pentest-gates.sh
	./scripts/pentest-gates.sh

webhook-replay:
	chmod +x scripts/webhook-replay.sh
	./scripts/webhook-replay.sh

rto-drill:
	chmod +x scripts/rto-rpo-drill.sh
	./scripts/rto-rpo-drill.sh

tidy:
	cd packages/go-common && go mod tidy
	@for s in $(SERVICES); do (cd services/$$s && go mod tidy); done

build:
	@mkdir -p bin
	@for s in $(SERVICES); do echo building $$s; (cd services/$$s && go build -o ../../bin/$$s ./cmd/server); done

run-auth:
	HTTP_PORT=8001 ./bin/auth

run-catalog:
	HTTP_PORT=8002 ./bin/catalog

frontend-install:
	pnpm install

frontend-dev:
	pnpm dev:storefront

k6-health:
	k6 run infra/k6/health.js

k6-checkout:
	k6 run infra/k6/checkout.js

k6-load:
	K6_PROFILE=load k6 run infra/k6/catalog.js

k6-stress:
	@echo "stress (100k VUs) only on dedicated staging — set CONFIRM_STRESS=1"
	@test "$(CONFIRM_STRESS)" = "1"
	CONFIRM_STRESS=1 K6_PROFILE=stress k6 run infra/k6/checkout.js

seed:
	./scripts/seed.sh
