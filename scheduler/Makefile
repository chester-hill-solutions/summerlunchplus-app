IMAGE_NAME ?= summerlunchplus-scheduler-local
CONTAINER_NAME ?= summerlunchplus-scheduler-cron
ENV_FILE ?= .env.local

.PHONY: check-env build cron cron-bg down logs status smoke-zoom smoke-gift-card smoke-export smoke-cleanup smoke-all

check-env:
	@test -f "$(ENV_FILE)" || (echo "Missing $(ENV_FILE). Create it from .env.template." && exit 1)

build: check-env
	docker build -t $(IMAGE_NAME) .

cron: build
	docker run --rm --name $(CONTAINER_NAME) --env-file $(ENV_FILE) $(IMAGE_NAME)

cron-bg: build
	-docker rm -f $(CONTAINER_NAME)
	docker run -d --name $(CONTAINER_NAME) --env-file $(ENV_FILE) $(IMAGE_NAME)

down:
	-docker stop $(CONTAINER_NAME)

logs:
	docker logs -f $(CONTAINER_NAME)

status:
	docker ps --filter "name=$(CONTAINER_NAME)"

smoke-zoom: build
	docker run --rm --env-file $(ENV_FILE) $(IMAGE_NAME) /bin/bash /app/scripts/zoom-jobs.sh

smoke-gift-card: build
	docker run --rm --env-file $(ENV_FILE) $(IMAGE_NAME) /bin/bash /app/scripts/gift-card-jobs.sh

smoke-export: build
	docker run --rm --env-file $(ENV_FILE) $(IMAGE_NAME) /bin/bash /app/scripts/export-jobs.sh

smoke-cleanup: build
	docker run --rm --env-file $(ENV_FILE) $(IMAGE_NAME) /bin/bash /app/scripts/export-cleanup.sh

smoke-all: smoke-zoom smoke-gift-card smoke-export smoke-cleanup
