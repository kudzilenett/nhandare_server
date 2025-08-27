#!/bin/bash

# Quick SSL Setup for IP-based access using nip.io
# This script sets up SSL for your EC2 IP address using nip.io domain

set -e

echo "🔒 Quick SSL Setup for Nhandare (IP-based)"
echo "=========================================="

# Your EC2 IP
EC2_IP="51.20.12.21"
DOMAIN="${EC2_IP}.nip.io"
EMAIL="admin@nhandare.com"

echo "📋 Configuration:"
echo "   EC2 IP: $EC2_IP"
echo "   Domain: $DOMAIN"
echo "   Email: $EMAIL"
echo ""

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root. Please run as ubuntu user."
   exit 1
fi

echo "🔧 Step 1: Installing Certbot..."
sudo apt update
sudo apt install -y certbot curl

echo "🔧 Step 2: Stopping existing Nginx container..."
docker stop nhandare_nginx_prod 2>/dev/null || true
docker rm nhandare_nginx_prod 2>/dev/null || true

echo "🔧 Step 3: Generating SSL certificate for $DOMAIN..."
echo "   This will use Let's Encrypt to generate a free SSL certificate"
echo "   Domain: $DOMAIN"
echo ""

sudo certbot certonly --standalone \
    --preferred-challenges http \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

if [[ $? -ne 0 ]]; then
    echo "❌ Failed to generate SSL certificate"
    echo "   Please check the error messages above"
    echo "   Common issues:"
    echo "   - Port 80 must be free (stop Nginx first)"
    echo "   - Internet connection must be working"
    echo "   - Firewall must allow port 80"
    exit 1
fi

echo "✅ SSL certificate generated successfully!"

echo "🔧 Step 4: Setting up SSL directory..."
sudo mkdir -p /etc/nginx/ssl
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /etc/nginx/ssl/key.pem
sudo chown -R ubuntu:ubuntu /etc/nginx/ssl
sudo chmod 600 /etc/nginx/ssl/key.pem
sudo chmod 644 /etc/nginx/ssl/cert.pem

echo "🔧 Step 5: Creating Nginx SSL configuration..."
cat > nginx-ssl.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # Basic settings
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    # HTTP server (redirect to HTTPS)
    server {
        listen 80;
        server_name _;
        
        # Health check
        location /health {
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # Redirect all HTTP to HTTPS
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
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # Health check
        location /health {
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # API endpoints
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://backend:3001;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
        }

        # Socket.io
        location /socket.io/ {
            proxy_pass http://backend:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 86400s;
        }

        # Default proxy to backend
        location / {
            proxy_pass http://backend:3001;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
        }
    }
}
EOF

echo "🔧 Step 6: Starting Nginx with SSL..."
docker run -d --name nhandare_nginx_prod \
    -p 80:80 -p 443:443 \
    -v $(pwd)/nginx-ssl.conf:/etc/nginx/nginx.conf:ro \
    -v /etc/nginx/ssl:/etc/nginx/ssl:ro \
    --network nhandare_server_nhandare_prod_network \
    nginx:alpine

echo "🔧 Step 7: Setting up auto-renewal..."
cat > renew-ssl.sh << 'EOF'
#!/bin/bash
echo "Renewing SSL certificates..."
sudo certbot renew --quiet
if [[ $? -eq 0 ]]; then
    echo "Certificates renewed, restarting Nginx..."
    sudo cp /etc/letsencrypt/live/51.20.12.21.nip.io/fullchain.pem /etc/nginx/ssl/cert.pem
    sudo cp /etc/letsencrypt/live/51.20.12.21.nip.io/privkey.pem /etc/nginx/ssl/key.pem
    sudo chown -R ubuntu:ubuntu /etc/nginx/ssl
    sudo chmod 600 /etc/nginx/ssl/key.pem
    sudo chmod 644 /etc/nginx/ssl/cert.pem
    docker restart nhandare_nginx_prod
    echo "Nginx restarted with new certificates"
fi
EOF

chmod +x renew-ssl.sh

# Add to crontab for daily renewal check
(crontab -l 2>/dev/null; echo "0 3 * * * /home/ubuntu/nhandare_server/renew-ssl.sh") | crontab -

echo "🔧 Step 8: Testing SSL setup..."
sleep 5

echo "Testing HTTP to HTTPS redirect..."
HTTP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN/health)
if [[ $HTTP_RESPONSE == "301" ]]; then
    echo "✅ HTTP to HTTPS redirect working"
else
    echo "⚠️  HTTP redirect got $HTTP_RESPONSE"
fi

echo "Testing HTTPS..."
HTTPS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -k https://$DOMAIN/health)
if [[ $HTTPS_RESPONSE == "200" ]]; then
    echo "✅ HTTPS working correctly"
else
    echo "⚠️  HTTPS got $HTTPS_RESPONSE"
fi

echo ""
echo "🎉 SSL Setup Complete!"
echo "====================="
echo ""
echo "🌐 Your Nhandare API is now accessible via:"
echo "   HTTPS: https://$DOMAIN"
echo "   API:  https://$DOMAIN/api/*"
echo ""
echo "🔧 Management:"
echo "   View logs: docker logs nhandare_nginx_prod"
echo "   Restart:  docker restart nhandare_nginx_prod"
echo "   Renew:    ./renew-ssl.sh"
echo ""
echo "⚠️  Note: Certificates auto-renew daily at 3 AM"
echo "🚀 Your API is now secure with HTTPS!"
