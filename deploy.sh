#!/bin/bash

# Nhandare Production Deployment Script
# Run this on your production server

set -e

echo "🚀 Deploying Nhandare Production Environment..."

# Check if we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ Error: Please run this script from the nhandare_server directory"
    exit 1
fi

# Make scripts executable
chmod +x scripts/prod-manager.sh

# Create necessary directories
mkdir -p monitoring/grafana/provisioning
mkdir -p backups
mkdir -p logs
mkdir -p uploads

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found. Please create it with your production variables."
    echo "Required variables: POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET"
fi

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

# Remove old containers and networks
echo "🧹 Cleaning up old containers..."
docker container prune -f
docker network prune -f

# Start production services
echo "🚀 Starting production services..."
./scripts/prod-manager.sh start

# Wait a moment for services to stabilize
echo "⏳ Waiting for services to stabilize..."
sleep 10

# Check service status
echo "📊 Checking service status..."
./scripts/prod-manager.sh status

# Test health endpoints
echo "🏥 Testing health endpoints..."
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed"
fi

if curl -s http://localhost/health > /dev/null; then
    echo "✅ Nginx health check passed"
else
    echo "❌ Nginx health check failed"
fi

echo ""
echo "🎉 Deployment completed!"
echo ""
echo "📊 Next steps:"
echo "1. Check service status: ./scripts/prod-manager.sh status"
echo "2. View logs: ./scripts/prod-manager.sh logs"
echo "3. Start monitoring: ./scripts/prod-manager.sh monitoring start"
echo "4. Access your app: http://your-server-ip"
echo ""
echo "📚 For more info, see: PRODUCTION_README.md"
