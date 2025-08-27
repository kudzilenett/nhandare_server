#!/bin/bash

# Nhandare Production Management Script
# This script provides a professional way to manage your production environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_PROD="docker-compose -f docker-compose.prod.yml --env-file .env.production"
COMPOSE_MON="docker-compose -f docker-compose.monitoring.yml"
NETWORK_NAME="nhandare_server_nhandare_prod_network"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_network() {
    if ! docker network ls | grep -q "$NETWORK_NAME"; then
        log_info "Creating production network..."
        docker network create --subnet=172.21.0.0/16 "$NETWORK_NAME"
    fi
}

check_environment() {
    if [ ! -f .env.production ]; then
        log_error ".env.production file not found! Please create it with your production variables."
        exit 1
    fi
    
    # Source environment variables
    log_info "Loading environment variables from .env.production..."
    set -a
    source .env.production
    set +a
    
    # Check required environment variables
    required_vars=("POSTGRES_PASSWORD" "REDIS_PASSWORD" "JWT_SECRET")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_warning "Environment variable $var is not set"
        else
            log_info "✓ $var is set"
        fi
    done
}

# Main functions
start_services() {
    log_info "Starting production services..."
    check_network
    check_environment
    
    $COMPOSE_PROD up -d
    
    log_info "Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    if $COMPOSE_PROD ps | grep -q "Up"; then
        log_success "All services are running!"
    else
        log_error "Some services failed to start. Check logs with: $COMPOSE_PROD logs"
        exit 1
    fi
}

stop_services() {
    log_info "Stopping production services..."
    $COMPOSE_PROD down
    log_success "Services stopped"
}

restart_services() {
    log_info "Restarting production services..."
    stop_services
    start_services
}

start_monitoring() {
    log_info "Starting monitoring stack..."
    check_network
    
    $COMPOSE_MON up -d
    
    log_info "Monitoring services started:"
    log_info "- Prometheus: http://localhost:9090"
    log_info "- Grafana: http://localhost:3000 (admin/admin123)"
    log_info "- cAdvisor: http://localhost:8080"
    log_info "- Node Exporter: http://localhost:9100"
}

stop_monitoring() {
    log_info "Stopping monitoring stack..."
    $COMPOSE_MON down
    log_success "Monitoring services stopped"
}

show_status() {
    log_info "Production Services Status:"
    $COMPOSE_PROD ps
    
    echo ""
    log_info "Monitoring Services Status:"
    $COMPOSE_MON ps
    
    echo ""
    log_info "Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
}

show_logs() {
    local service=${1:-""}
    if [ -z "$service" ]; then
        log_info "Showing logs for all services..."
        $COMPOSE_PROD logs --tail=50 -f
    else
        log_info "Showing logs for $service..."
        $COMPOSE_PROD logs --tail=50 -f "$service"
    fi
}

backup_database() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="backup_${timestamp}.sql"
    
    log_info "Creating database backup: $backup_file"
    
    if $COMPOSE_PROD exec -T postgres pg_dump -U "${POSTGRES_USER:-nhandare_user}" nhandare_gaming > "backups/$backup_file"; then
        log_success "Database backup created: backups/$backup_file"
    else
        log_error "Database backup failed!"
        exit 1
    fi
}

update_services() {
    log_info "Updating services..."
    
    # Pull latest images
    $COMPOSE_PROD pull
    
    # Rebuild and restart
    $COMPOSE_PROD up -d --build
    
    log_success "Services updated and restarted"
}

# Main script logic
case "${1:-}" in
    "start")
        start_services
        ;;
    "stop")
        stop_services
        ;;
    "restart")
        restart_services
        ;;
    "monitoring")
        case "${2:-}" in
            "start")
                start_monitoring
                ;;
            "stop")
                stop_monitoring
                ;;
            *)
                log_error "Usage: $0 monitoring {start|stop}"
                exit 1
                ;;
        esac
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs "$2"
        ;;
    "backup")
        backup_database
        ;;
    "update")
        update_services
        ;;
    *)
        echo "Nhandare Production Manager"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs|backup|update}"
        echo "       $0 monitoring {start|stop}"
        echo ""
        echo "Commands:"
        echo "  start       - Start production services"
        echo "  stop        - Stop production services"
        echo "  restart     - Restart production services"
        echo "  monitoring  - Manage monitoring stack"
        echo "  status      - Show service status and resource usage"
        echo "  logs        - Show logs (optionally specify service)"
        echo "  backup      - Create database backup"
        echo "  update      - Update and restart services"
        echo ""
        echo "Examples:"
        echo "  $0 start"
        echo "  $0 monitoring start"
        echo "  $0 logs backend"
        echo "  $0 status"
        exit 1
        ;;
esac
