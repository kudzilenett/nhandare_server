# Nhandare Backend Docker Makefile
.PHONY: help build build-dev up up-dev down down-dev logs logs-dev clean clean-all restart restart-dev status status-dev db-reset db-seed db-migrate db-studio health

# Default target
help:
	@echo "Nhandare Backend Docker Commands:"
	@echo ""
	@echo "Development Commands:"
	@echo "  build-dev    - Build development containers"
	@echo "  up-dev       - Start development environment"
	@echo "  down-dev     - Stop development environment"
	@echo "  logs-dev     - View development logs"
	@echo "  restart-dev  - Restart development environment"
	@echo "  status-dev   - Show development container status"
	@echo ""
	@echo "Production Commands:"
	@echo "  build        - Build production containers"
	@echo "  up           - Start production environment"
	@echo "  down         - Stop production environment"
	@echo "  logs         - View production logs"
	@echo "  restart      - Restart production environment"
	@echo "  status       - Show production container status"
	@echo ""
	@echo "Database Commands:"
	@echo "  db-reset     - Reset database (development only)"
	@echo "  db-seed      - Seed database with initial data"
	@echo "  db-migrate   - Run database migrations"
	@echo "  db-studio    - Open Prisma Studio"
	@echo ""
	@echo "Utility Commands:"
	@echo "  clean        - Remove containers and volumes"
	@echo "  clean-all    - Remove all containers, volumes, and images"
	@echo "  health       - Check service health"
	@echo "  shell        - Open shell in backend container"
	@echo "  shell-dev    - Open shell in development backend container"

# Development Commands
build-dev:
	@echo "Building development containers..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml build

up-dev:
	@echo "Starting development environment..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo "Development environment started!"
	@echo "Backend: http://localhost:3001"
	@echo "PostgreSQL: localhost:5432"
	@echo "Redis: localhost:6379"

down-dev:
	@echo "Stopping development environment..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

logs-dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

restart-dev:
	@echo "Restarting development environment..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart

status-dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps

# Production Commands
build-prod:
	@echo "Building production containers..."
	docker-compose -f docker-compose.prod.yml build

up-prod:
	@echo "Starting production environment..."
	docker-compose -f docker-compose.prod.yml up -d
	@echo "Production environment started!"
	@echo "Backend: http://localhost:3001"
	@echo "PostgreSQL: localhost:5432"
	@echo "Redis: localhost:6379"
	@echo "Nginx: http://localhost:80"

down-prod:
	@echo "Stopping production environment..."
	docker-compose -f docker-compose.prod.yml down

logs-prod:
	docker-compose -f docker-compose.prod.yml logs -f

restart-prod:
	@echo "Restarting production environment..."
	docker-compose -f docker-compose.prod.yml restart

status-prod:
	docker-compose -f docker-compose.prod.yml ps

# Legacy production commands (for backward compatibility)
build: build-prod
up: up-prod
down: down-prod
logs: logs-prod
restart: restart-prod
status: status-prod

# Database Commands
db-reset:
	@echo "Resetting database (development only)..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend npm run db:reset

db-seed:
	@echo "Seeding database..."
	docker-compose exec backend npm run db:seed

db-migrate:
	@echo "Running database migrations..."
	docker-compose exec backend npm run db:migrate

db-studio:
	@echo "Opening Prisma Studio..."
	docker-compose exec backend npm run db:studio

# Utility Commands
clean:
	@echo "Removing containers and volumes..."
	docker-compose down -v
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v

clean-all:
	@echo "Removing all containers, volumes, and images..."
	docker-compose down -v --rmi all
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v --rmi all
	docker system prune -f

health:
	@echo "Checking service health..."
	@echo "Backend:"
	@curl -f http://localhost:3001/health || echo "Backend is not healthy"
	@echo "PostgreSQL:"
	@docker-compose exec postgres pg_isready -U nhandare_user -d nhandare_gaming || echo "PostgreSQL is not healthy"
	@echo "Redis:"
	@docker-compose exec redis redis-cli ping || echo "Redis is not healthy"

shell:
	@echo "Opening shell in production backend container..."
	docker-compose exec backend sh

shell-dev:
	@echo "Opening shell in development backend container..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend sh

# Quick start for development
dev: build-dev up-dev
	@echo "Development environment ready!"

# Quick start for production
prod: build up
	@echo "Production environment ready!"

# Stop all environments
stop-all:
	@echo "Stopping all environments..."
	docker-compose down
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

# Show all running containers
ps-all:
	@echo "All running containers:"
	docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Backup database
backup:
	@echo "Creating database backup..."
	docker-compose exec postgres pg_dump -U nhandare_user nhandare_gaming > backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "Backup created!"

# Restore database from backup
restore:
	@echo "Usage: make restore BACKUP_FILE=backup_filename.sql"
	@if [ -z "$(BACKUP_FILE)" ]; then echo "Please specify BACKUP_FILE"; exit 1; fi
	@echo "Restoring database from $(BACKUP_FILE)..."
	docker-compose exec -T postgres psql -U nhandare_user -d nhandare_gaming < $(BACKUP_FILE)
	@echo "Database restored!"
