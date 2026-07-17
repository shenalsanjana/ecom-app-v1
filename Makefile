.PHONY: help build up down stop restart logs ps migrate seed admin-ensure migrate-images deploy backup restore

help:
	@echo "Available targets:"
	@echo "  make build          - build Docker images"
	@echo "  make up             - start the stack (detached)"
	@echo "  make down           - stop and remove containers (volumes preserved)"
	@echo "  make stop           - stop containers without removing them"
	@echo "  make restart        - restart all services"
	@echo "  make logs           - follow logs for all services"
	@echo "  make ps             - show running services"
	@echo "  make migrate        - run database migrations"
	@echo "  make seed           - seed the database"
	@echo "  make admin-ensure   - ensure the default admin user exists"
	@echo "  make migrate-images - one-time: migrate existing images off Vercel Blob"
	@echo "  make deploy         - git pull, migrate, rebuild, restart (scripts/deploy.sh)"
	@echo "  make backup         - back up the database (scripts/backup-db.sh)"
	@echo "  make restore FILE=path/to/backup.bak - restore the database"

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

stop:
	docker compose stop

restart:
	docker compose restart

logs:
	docker compose logs -f

ps:
	docker compose ps

migrate:
	docker compose --profile tools run --rm migrator npx prisma migrate deploy

seed:
	docker compose --profile tools run --rm migrator npm run db:seed

admin-ensure:
	docker compose --profile tools run --rm migrator npm run admin:ensure

migrate-images:
	docker compose --profile tools run --rm migrator npm run migrate:images

deploy:
	./scripts/deploy.sh

backup:
	./scripts/backup-db.sh

restore:
	./scripts/restore-db.sh $(FILE)
