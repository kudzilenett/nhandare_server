# Nhandare EC2 Connection & Deployment Guide

## 🚀 Quick Start - Connect to EC2

### Prerequisites

- Your `nhandare.pem` private key file
- SSH client (PowerShell, Git Bash, or Terminal)

### Connection Steps

#### Option 1: Using PowerShell (Windows)

```powershell
# Navigate to your SSH directory
cd "C:\Users\KudziZvourerenexo\nexo\Documents\Kudzi\prj\ssh"

# Connect to EC2
ssh -i "nhandare.pem" ubuntu@51.20.12.21
```

#### Option 2: Using Git Bash or Terminal

```bash
# Navigate to your SSH directory
cd "C:\Users\KudziZvourerenexo\nexo\Documents\Kudzi\prj\ssh"

# Connect to EC2
ssh -i "nhandare.pem" ubuntu@51.20.12.21
```

#### Option 3: Using the Batch File

```cmd
# Run the provided batch file
cd "C:\Users\KudziZvourerenexo\nexo\Documents\Kudzi\prj\Nhandare\nhandare_server\deploy"
connect-ec2.bat
```

## 🔧 EC2 Instance Details

- **Instance ID:** `i-0e43053b91648d7b5`
- **Public IP:** `51.20.12.21`
- **Security Group:** `launch-wizard-1` (ID: `sg-0f2f928b1ce1f68b8`)
- **Key Pair:** `nhandare`
- **Region:** Based on your VPC `vpc-08c9af026e80a0807`

## 📁 Project Location on EC2

Once connected, your project is located at:

```bash
cd /home/ubuntu/nhandare_server
```

## 🐳 Docker Management

### Check Container Status

```bash
docker ps -a
```

### Start/Stop Services

```bash
# Start all services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Stop all services
docker-compose -f docker-compose.prod.yml down

# Restart specific service
docker restart nhandare_backend_prod
```

### View Logs

```bash
# Backend logs
docker logs nhandare_backend_prod

# Database logs
docker logs nhandare_postgres_prod

# Redis logs
docker logs nhandare_redis_prod

# Nginx logs
docker logs nhandare_nginx_prod
```

## 🌐 Current API Access

### Health Check

```bash
# From EC2 (local)
curl http://localhost:3001/health

# From external (requires port 3001 to be open)
curl http://51.20.12.21:3001/health
```

### API Endpoints

- **Base URL:** `http://51.20.12.21:3001`
- **Health Check:** `/health`
- **API Documentation:** `/api-docs` (if configured)

## 🔒 Security Group Configuration

### Required Ports

- **Port 22 (SSH):** ✅ Already open (0.0.0.0/0)
- **Port 80 (HTTP):** ✅ Already open (0.0.0.0/0)
- **Port 443 (HTTPS):** ✅ Already open (0.0.0.0/0)
- **Port 3001 (API):** ✅ Already open (0.0.0.0/0)

### How to Modify Security Group

1. Go to AWS Console → EC2 → Security Groups
2. Find `launch-wizard-1` (ID: `sg-0f2f928b1ce1f68b8`)
3. Click "Edit inbound rules"
4. Add/remove rules as needed

## 🚨 Nginx Setup & SSL Configuration

### Current Issue

Nginx container is failing because it's configured for SSL but missing certificates.

### 🚀 Quick SSL Setup (Recommended)

We've created automated scripts to set up SSL quickly. Here are your options:

#### Option 1: Quick IP-based SSL Setup (Easiest)

```bash
# 1. Connect to EC2
ssh -i "nhandare.pem" ubuntu@51.20.12.21

# 2. Navigate to project
cd /home/ubuntu/nhandare_server

# 3. Run the quick SSL setup script
chmod +x scripts/setup-ssl-ip.sh
./scripts/setup-ssl-ip.sh
```

This script will:

- ✅ Install Certbot automatically
- ✅ Generate SSL certificate for `51.20.12.21.nip.io`
- ✅ Configure Nginx with SSL
- ✅ Set up automatic renewal
- ✅ Test the setup

#### Option 2: Full Production SSL Setup

```bash
# 1. Connect to EC2
ssh -i "nhandare.pm" ubuntu@51.20.12.21

# 2. Navigate to project
cd /home/ubuntu/nhandare_server

# 3. Run the full SSL setup script
chmod +x scripts/setup-ssl-production.sh
./scripts/setup-ssl-production.sh [yourdomain.com] [admin@email.com]
```

#### Option 3: Manual HTTP Setup (Temporary)

```bash
# 1. Connect to EC2
ssh -i "nhandare.pem" ubuntu@51.20.12.21

# 2. Navigate to project
cd /home/ubuntu/nhandare_server

# 3. Create HTTP-only nginx config
sudo mkdir -p /tmp/nginx-config
cat > /tmp/nginx-config/default.conf << 'EOF'
server {
    listen 80;
    server_name 51.20.12.21;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 4. Start nginx with custom config
docker run -d --name nhandare_nginx_http \
  -p 80:80 \
  -v /tmp/nginx-config:/etc/nginx/conf.d \
  --network nhandare_server_nhandare_prod_network \
  nginx:alpine
```

### 🔒 SSL Certificate Details

#### For IP-based access (nip.io):

- **Domain:** `51.20.12.21.nip.io`
- **Type:** Let's Encrypt (free, auto-renewing)
- **Validity:** 90 days (auto-renewed)
- **Renewal:** Daily at 3 AM

#### For custom domain:

- **Domain:** Your actual domain (e.g., `api.nhandare.com`)
- **Type:** Let's Encrypt (free, auto-renewing)
- **Validity:** 90 days (auto-renewed)
- **Renewal:** Twice daily at 2 AM and 2 PM

### 🔧 SSL Management Commands

```bash
# View SSL certificate status
sudo certbot certificates

# Manually renew certificates
./renew-ssl.sh

# Check Nginx SSL configuration
docker exec nhandare_nginx_prod nginx -t

# View SSL logs
docker logs nhandare_nginx_prod

# Restart Nginx
docker restart nhandare_nginx_prod
```

## 🔄 Deployment Workflow

### GitHub Actions Deployment

Your deployment workflow should now work correctly since:

- ✅ Port 3001 is open
- ✅ API is accessible externally
- ✅ Health checks pass

### Manual Deployment

```bash
# 1. Connect to EC2
ssh -i "nhandare.pem" ubuntu@51.20.12.21

# 2. Navigate to project
cd /home/ubuntu/nhandare_server

# 3. Pull latest changes
git pull origin master

# 4. Restart services
docker-compose -f docker-compose.prod.yml --env-file .env.production down
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# 5. Verify deployment
curl http://localhost:3001/health
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Connection Refused

```bash
# Check if containers are running
docker ps

# Check if port is listening
ss -tlnp | grep :3001
```

#### 2. Permission Denied

```bash
# Fix PEM file permissions
chmod 400 nhandare.pem
```

#### 3. Container Health Issues

```bash
# Check container logs
docker logs <container_name>

# Restart unhealthy container
docker restart <container_name>
```

#### 4. Security Group Issues

- Verify port 3001 is open in AWS Console
- Check that source is set to `0.0.0.0/0` for testing

## 📞 Support

### Useful Commands

```bash
# System info
htop
df -h
free -h

# Docker info
docker system df
docker volume ls
docker network ls

# Application logs
tail -f /var/log/syslog
journalctl -u docker
```

### Emergency Access

If you lose access to your PEM file:

1. Go to AWS Console → EC2 → Instances
2. Select your instance
3. Click "Actions" → "Security" → "Get Windows password"
4. Use the provided password to access via RDP (if Windows) or reset the key pair

---

**Last Updated:** August 26, 2025  
**Environment:** Production  
**Status:** ✅ API Accessible, 🔒 SSL Setup Scripts Ready, ⚠️ Nginx Needs SSL Setup
