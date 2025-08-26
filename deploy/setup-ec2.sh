#!/bin/bash

# Nhandare Backend EC2 Setup Script
# This script sets up a fresh EC2 instance for the Nhandare backend

set -e

echo "🚀 Starting Nhandare Backend EC2 Setup..."
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Please don't run this script as root. Use a regular user with sudo privileges."
    exit 1
fi

# Update system
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y
print_success "System updated successfully"

# Install essential packages
print_status "Installing essential packages..."
sudo apt install -y curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release
print_success "Essential packages installed"

# Install Docker
print_status "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    print_success "Docker installed successfully"
else
    print_success "Docker already installed"
fi

# Install Docker Compose
print_status "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose installed successfully"
else
    print_success "Docker Compose already installed"
fi

# Install Node.js
print_status "Installing Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    print_success "Node.js installed successfully"
else
    print_success "Node.js already installed"
fi

# Install Prisma CLI
print_status "Installing Prisma CLI..."
if ! command -v prisma &> /dev/null; then
    sudo npm install -g prisma
    print_success "Prisma CLI installed successfully"
else
    print_success "Prisma CLI already installed"
fi

# Verify installations
print_status "Verifying installations..."
echo "Docker version: $(docker --version)"
echo "Docker Compose version: $(docker-compose --version)"
echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Prisma version: $(prisma --version)"

# Create project directory
print_status "Setting up project directory..."
cd ~
if [ -d "nhandare_server" ]; then
    print_warning "nhandare_server directory already exists. Removing it..."
    rm -rf nhandare_server
fi

# Clone repository
print_status "Cloning Nhandare repository..."
git clone https://github.com/kudzilenett/nhandare_server.git
cd nhandare_server
print_success "Repository cloned successfully"

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p uploads logs ssl
mkdir -p ~/.ssh
print_success "Directories created"

# Set proper permissions
print_status "Setting proper permissions..."
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys 2>/dev/null || true
print_success "Permissions set"

# Set up production environment
print_status "Setting up production environment..."
if [ -f "env.production.example" ]; then
    cp env.production.example .env.production
    print_success "Production environment file created"
    print_warning "IMPORTANT: You need to edit .env.production with your actual values!"
    print_warning "Run: nano .env.production"
else
    print_error "env.production.example not found!"
    exit 1
fi

# Test Docker
print_status "Testing Docker installation..."
docker run --rm hello-world > /dev/null 2>&1
print_success "Docker test passed"

# Test Docker Compose
print_status "Testing Docker Compose..."
docker-compose --version > /dev/null 2>&1
print_success "Docker Compose test passed"

# Start services
print_status "Starting production services..."
docker-compose -f docker-compose.prod.yml up -d --build
print_success "Services started"

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 90

# Check service status
print_status "Checking service status..."
docker-compose -f docker-compose.prod.yml ps

# Test health endpoint
print_status "Testing health endpoint..."
max_attempts=5
attempt=1

while [ $attempt -le $max_attempts ]; do
    print_status "Health check attempt $attempt of $max_attempts..."
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        print_success "Health check passed on attempt $attempt!"
        break
    else
        print_warning "Health check failed on attempt $attempt"
        if [ $attempt -eq $max_attempts ]; then
            print_error "All health check attempts failed"
            print_status "Checking service logs..."
            docker-compose -f docker-compose.prod.yml logs
            exit 1
        fi
        print_status "Waiting 30 seconds before retry..."
        sleep 30
        attempt=$((attempt + 1))
    fi
done

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me)

# Final status
echo ""
echo "🎉 =========================================="
echo "🎉 EC2 Setup Completed Successfully!"
echo "🎉 =========================================="
echo ""
echo "📱 Your API is now running at:"
echo "   Local: http://localhost:3001"
echo "   Public: http://$PUBLIC_IP:3001"
echo "   Health: http://$PUBLIC_IP:3001/health"
echo ""
echo "🔧 Next steps:"
echo "   1. Edit .env.production with your actual values:"
echo "      nano .env.production"
echo ""
echo "   2. Restart services after editing:"
echo "      docker-compose -f docker-compose.prod.yml restart"
echo ""
echo "   3. Check logs if needed:"
echo "      docker-compose -f docker-compose.prod.yml logs -f"
echo ""
echo "   4. Test external access from your local machine:"
echo "      curl http://$PUBLIC_IP:3001/health"
echo ""
echo "⚠️  IMPORTANT: Make sure port 3001 is open in your EC2 security group!"
echo ""

print_success "Setup completed! Your Nhandare backend is now running on EC2!"
