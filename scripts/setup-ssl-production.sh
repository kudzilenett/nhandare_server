#!/bin/bash

# Production SSL Setup Script for Nhandare
# This script sets up proper SSL certificates using Let's Encrypt
# and configures Nginx for production use.

set -e

echo "🔒 Setting up SSL for Nhandare Production Environment"
echo "=================================================="

# Configuration
DOMAIN="${1:-51.20.12.21.nip.io}"  # Default to IP-based domain
EMAIL="${2:-admin@nhandare.com}"    # Default admin email
NGINX_CONTAINER="nhandare_nginx_prod"
BACKEND_CONTAINER="nhandare_backend_prod"
PROJECT_DIR="/home/ubuntu/nhandare_server"

echo "📋 Configuration:"
echo "   Domain: $DOMAIN"
echo "   Email: $EMAIL"
echo "   Project Directory: $PROJECT_DIR"
echo ""

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root. Please run as ubuntu user."
   exit 1
fi

# Check if we're in the right directory
if [[ ! -f "docker-compose.prod.yml" ]]; then
    echo "❌ Please run this script from the nhandare_server directory"
    exit 1
fi

echo "🔧 Step 1: Installing Certbot and dependencies..."
sudo apt update
sudo apt install -y certbot python3-certbot-nginx curl

echo "🔧 Step 2: Stopping Nginx container to free up port 80..."
docker stop $NGINX_CONTAINER 2>/dev/null || true
docker rm $NGINX_CONTAINER 2>/dev/null || true

echo "🔧 Step 3: Generating SSL certificate using Let's Encrypt..."
echo "   This may take a few minutes..."

# Generate certificate using standalone mode
sudo certbot certonly --standalone \
    --preferred-challenges http \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

if [[ $? -ne 0 ]]; then
    echo "❌ Failed to generate SSL certificate"
    echo "   Please check the error messages above and try again"
    exit 1
fi

echo "✅ SSL certificate generated successfully!"

echo "🔧 Step 4: Creating SSL directory structure..."
sudo mkdir -p /etc/nginx/ssl
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /etc/nginx/ssl/key.pem
sudo chown -R ubuntu:ubuntu /etc/nginx/ssl
sudo chmod 600 /etc/nginx/ssl/key.pem
sudo chmod 644 /etc/nginx/ssl/cert.pem

echo "🔧 Step 5: Creating production Nginx configuration..."
cat > nginx.prod.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # Basic settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    # Upstream backend servers
    upstream backend {
        server backend:3001;
        keepalive 32;
    }

    # HTTP server (redirect to HTTPS)
    server {
        listen 80;
        server_name _;
        
        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # Redirect all HTTP traffic to HTTPS
        return 301 https://$server_name$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;

        # SSL configuration
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin";

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # API endpoints with rate limiting
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }

        # Authentication endpoints with stricter rate limiting
        location ~ ^/api/(auth|login|register|forgot-password) {
            limit_req zone=login burst=5 nodelay;
            
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }

        # Socket.io endpoints
        location /socket.io/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }

        # Static file uploads
        location /uploads/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Default proxy to backend
        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }

        # Error pages
        error_page 404 /404.html;
        error_page 500 502 503 504 /50x.html;
        
        location = /50x.html {
            root /usr/share/nginx/html;
        }
    }
}
EOF

echo "🔧 Step 6: Starting Nginx with SSL configuration..."
docker run -d --name $NGINX_CONTAINER \
    -p 80:80 -p 443:443 \
    -v $(pwd)/nginx.prod.conf:/etc/nginx/nginx.conf:ro \
    -v /etc/nginx/ssl:/etc/nginx/ssl:ro \
    --network nhandare_server_nhandare_prod_network \
    nginx:alpine

echo "🔧 Step 7: Setting up automatic certificate renewal..."
# Create renewal script
cat > renew-ssl.sh << 'EOF'
#!/bin/bash
# SSL Certificate Renewal Script
echo "Renewing SSL certificates..."
sudo certbot renew --quiet
if [[ $? -eq 0 ]]; then
    echo "Certificates renewed successfully, restarting Nginx..."
    sudo cp /etc/letsencrypt/live/51.20.12.21.nip.io/fullchain.pem /etc/nginx/ssl/cert.pem
    sudo cp /etc/letsencrypt/live/51.20.12.21.nip.io/privkey.pem /etc/nginx/ssl/key.pem
    sudo chown -R ubuntu:ubuntu /etc/nginx/ssl
    sudo chmod 600 /etc/nginx/ssl/key.pem
    sudo chmod 644 /etc/nginx/ssl/cert.pem
    docker restart nhandare_nginx_prod
    echo "Nginx restarted with new certificates"
else
    echo "Certificate renewal failed"
fi
EOF

chmod +x renew-ssl.sh

# Add to crontab for automatic renewal (twice daily)
(crontab -l 2>/dev/null; echo "0 2,14 * * * /home/ubuntu/nhandare_server/renew-ssl.sh") | crontab -

echo "🔧 Step 8: Testing SSL setup..."
sleep 5  # Wait for Nginx to start

# Test HTTP to HTTPS redirect
echo "Testing HTTP to HTTPS redirect..."
HTTP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN/health)
if [[ $HTTP_RESPONSE == "301" ]]; then
    echo "✅ HTTP to HTTPS redirect working"
else
    echo "⚠️  HTTP to HTTPS redirect may not be working (got $HTTP_RESPONSE)"
fi

# Test HTTPS
echo "Testing HTTPS..."
HTTPS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -k https://$DOMAIN/health)
if [[ $HTTPS_RESPONSE == "200" ]]; then
    echo "✅ HTTPS working correctly"
else
    echo "⚠️  HTTPS may not be working (got $HTTPS_RESPONSE)"
fi

echo ""
echo "🎉 SSL Setup Complete!"
echo "====================="
echo ""
echo "📋 Summary:"
echo "   ✅ SSL certificates generated for $DOMAIN"
echo "   ✅ Nginx configured with SSL"
echo "   ✅ Automatic renewal scheduled (twice daily)"
echo "   ✅ HTTP to HTTPS redirect enabled"
echo ""
echo "🌐 Access URLs:"
echo "   HTTP:  http://$DOMAIN (redirects to HTTPS)"
echo "   HTTPS: https://$DOMAIN"
echo "   API:  https://$DOMAIN/api/*"
echo ""
echo "🔧 Management Commands:"
echo "   View Nginx logs: docker logs $NGINX_CONTAINER"
echo "   Restart Nginx:  docker restart $NGINX_CONTAINER"
echo "   Renew certificates manually: ./renew-ssl.sh"
echo "   Check certificate expiry: sudo certbot certificates"
echo ""
echo "⚠️  Important Notes:"
echo "   - Certificates will auto-renew every 60 days"
echo "   - Keep the renew-ssl.sh script in place"
echo "   - Monitor logs for any renewal issues"
echo "   - Backup /etc/letsencrypt directory regularly"
echo ""
echo "🚀 Your Nhandare API is now accessible via HTTPS!"
