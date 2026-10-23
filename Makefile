.PHONY: help up down build restart logs ps migrate seed backup restore shell db-shell dev frontend-dev clean

SHELL := /bin/bash
COMPOSE := docker compose

help: ## Tampilkan daftar perintah
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## Build & jalankan seluruh stack
	$(COMPOSE) up -d --build

build: ## Build image dagang-apps
	$(COMPOSE) build dagang-apps

down: ## Hentikan container (data tetap aman)
	$(COMPOSE) down

restart: ## Restart container aplikasi
	$(COMPOSE) restart dagang-apps

logs: ## Lihat log aplikasi
	$(COMPOSE) logs -f --tail=100 dagang-apps

ps: ## Status container
	$(COMPOSE) ps

migrate: ## Jalankan migrasi alembic di dalam container
	$(COMPOSE) exec dagang-apps alembic upgrade head

seed: ## Jalankan seed owner
	$(COMPOSE) exec dagang-apps python -m dagang.cli seed-owner

create-user: ## Buat user baru: make create-user USERNAME=andi PASSWORD=rahasia ROLE=kasir
	$(COMPOSE) exec dagang-apps python -m dagang.cli create-user $(USERNAME) $(PASSWORD)

backup: ## Backup database ke ./data/backups
	./scripts/backup.sh

restore: ## Restore database: make restore FILE=data/backups/dalang-xxxx.sql.gz
	./scripts/restore.sh $(FILE)

shell: ## Shell di container aplikasi
	$(COMPOSE) exec dagang-apps bash

db-shell: ## Shell psql di container database
	$(COMPOSE) exec dagang-db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

dev: ## Jalankan backend & frontend mode dev (butuh DB)
	$(COMPOSE) up -d dagang-db
	cd backend && python -m dagang.cli wait-db && flask --app dagang:create_app run --host 0.0.0.0 --port 8787 &
	cd frontend && npm run dev

clean: ## Hapus build & cache (tidak menghapus data)
	rm -rf frontend/dist frontend/node_modules
	find . -name '__pycache__' -type d -prune -exec rm -rf {} +
