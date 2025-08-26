#!/bin/bash

# Nhandare Backend EC2 Setup Script
# Run this script on your EC2 instance to prepare it for deployment

set -e

echo "🚀 Setting up EC2 instance for Nhandare Backend deployment..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Install Docker Compose
echo "🐳 Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add user to docker group
echo "👤 Adding user to docker group..."
sudo usermod -aG docker $USER

# Install Git
echo "📚 Installing Git..."
sudo apt install -y git

# Create project directory
echo "📁 Creating project directory..."
mkdir -p ~/nhandare_server
cd ~/nhandare_server

# Clone repository (you'll need to set up SSH keys or use HTTPS)
echo "📥 Cloning repository..."
# git clone https://github.com/yourusername/nhandare_server.git .
# OR if using SSH:
# git clone git@github.com:yourusername/nhandare_server.git .

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p uploads logs ssl

# Set up environment file
echo "⚙️ Setting up environment file..."
if [ ! -f .env.production ]; then
    cp env.production.example .env.production
    echo "⚠️  Please edit .env.production with your production values!"
fi

# Set proper permissions
echo "🔐 Setting proper permissions..."
chmod 600 .env.production
chmod +x deploy/*.sh

# Install Node.js (for Prisma CLI)
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Prisma CLI
echo "🗄️ Installing Prisma CLI..."
npm install -g prisma

# Run database migrations
echo "🗄️ Setting up database..."
make db-migrate || echo "⚠️  Database migration failed - this is normal for first setup"

# Start services
echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 60

# Test health endpoint
echo "🏥 Testing health endpoint..."
if curl -f http://localhost:3001/health; then
    echo "✅ Setup completed successfully!"
    echo "🌐 Your API is available at: http://$(curl -s ifconfig.me):3001"
    echo "🏥 Health check: http://$(curl -s ifconfig.me):3001/health"
else
    echo "❌ Health check failed. Check logs with: docker-compose logs"
    exit 1
fi

echo ""
echo "🎉 EC2 setup completed!"
echo ""
echo "Next steps:"
echo "1. Edit .env.production with your real values"
echo "2. Set up GitHub Actions secrets"
echo "3. Push to main branch to trigger deployment"
echo ""
echo "Useful commands:"
echo "  make status-prod     # Check service status"
echo "  make logs-prod       # View logs"
echo "  make restart-prod     # Restart services"
echo "  make down-prod        # Stop services"
