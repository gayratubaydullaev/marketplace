# Gayrat Marketplace Makefile

export PATH := $(HOME)/.local/go/bin:$(PATH)
SERVICES := auth catalog search cart orders payments vendor reviews notifications analytics media realtime

.PHONY: infra-up infra-down tidy build run-auth run-all frontend-install frontend-dev seed k6-health

infra-up:
	docker compose -f infra/docker/docker-compose.dev.yml up -d

infra-down:
	docker compose -f infra/docker/docker-compose.dev.yml down

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

seed:
	./scripts/seed.sh
