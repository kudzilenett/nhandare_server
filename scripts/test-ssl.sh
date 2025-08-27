#!/bin/bash

# SSL Test Script for Nhandare
# This script tests your SSL setup and provides a health check

echo "🔒 Testing Nhandare SSL Setup"
echo "============================="

# Configuration
EC2_IP="51.20.12.21"
DOMAIN="${EC2_IP}.nip.io"

echo "📋 Testing Configuration:"
echo "   EC2 IP: $EC2_IP"
echo "   Domain: $DOMAIN"
echo ""

# Test 1: Check if Nginx container is running
echo "🔍 Test 1: Checking Nginx container status..."
if docker ps | grep -q "nhandare_nginx_prod"; then
    echo "✅ Nginx container is running"
    NGINX_STATUS="running"
else
    echo "❌ Nginx container is not running"
    NGINX_STATUS="stopped"
fi

# Test 2: Check if ports are listening
echo ""
echo "🔍 Test 2: Checking port status..."
if netstat -tlnp 2>/dev/null | grep -q ":80 "; then
    echo "✅ Port 80 (HTTP) is listening"
else
    echo "❌ Port 80 (HTTP) is not listening"
fi

if netstat -tlnp 2>/dev/null | grep -q ":443 "; then
    echo "✅ Port 443 (HTTPS) is listening"
else
    echo "❌ Port 443 (HTTPS) is not listening"
fi

# Test 3: Check SSL certificate
echo ""
echo "🔍 Test 3: Checking SSL certificate..."
if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    echo "✅ SSL certificate exists"
    
    # Check certificate expiry
    CERT_EXPIRY=$(openssl x509 -in /etc/letsencrypt/live/$DOMAIN/fullchain.pem -text -noout | grep "Not After" | cut -d: -f2-)
    echo "   Expires: $CERT_EXPIRY"
    
    # Check days until expiry
    EXPIRY_DATE=$(echo "$CERT_EXPIRY" | xargs -I {} date -d "{}" +%s)
    CURRENT_DATE=$(date +%s)
    DAYS_LEFT=$(( ($EXPIRY_DATE - $CURRENT_DATE) / 86400 ))
    
    if [[ $DAYS_LEFT -gt 30 ]]; then
        echo "   Status: ✅ Valid for $DAYS_LEFT days"
    elif [[ $DAYS_LEFT -gt 7 ]]; then
        echo "   Status: ⚠️  Expires in $DAYS_LEFT days"
    else
        echo "   Status: 🚨 Expires in $DAYS_LEFT days (renewal needed)"
    fi
else
    echo "❌ SSL certificate not found"
fi

# Test 4: Test HTTP to HTTPS redirect
echo ""
echo "🔍 Test 4: Testing HTTP to HTTPS redirect..."
if command -v curl >/dev/null 2>&1; then
    HTTP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN/health 2>/dev/null || echo "000")
    if [[ $HTTP_RESPONSE == "301" ]]; then
        echo "✅ HTTP to HTTPS redirect working (301)"
    else
        echo "⚠️  HTTP redirect got $HTTP_RESPONSE (expected 301)"
    fi
else
    echo "⚠️  curl not available, skipping HTTP test"
fi

# Test 5: Test HTTPS
echo ""
echo "🔍 Test 5: Testing HTTPS..."
if command -v curl >/dev/null 2>&1; then
    HTTPS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -k https://$DOMAIN/health 2>/dev/null || echo "000")
    if [[ $HTTPS_RESPONSE == "200" ]]; then
        echo "✅ HTTPS working correctly (200)"
    else
        echo "⚠️  HTTPS got $HTTPS_RESPONSE (expected 200)"
    fi
else
    echo "⚠️  curl not available, skipping HTTPS test"
fi

# Test 6: Check SSL configuration
echo ""
echo "🔍 Test 6: Checking Nginx SSL configuration..."
if [[ "$NGINX_STATUS" == "running" ]]; then
    if docker exec nhandare_nginx_prod nginx -t 2>/dev/null; then
        echo "✅ Nginx SSL configuration is valid"
    else
        echo "❌ Nginx SSL configuration has errors"
    fi
else
    echo "⚠️  Skipping Nginx config test (container not running)"
fi

# Summary
echo ""
echo "📊 SSL Setup Summary"
echo "==================="

if [[ "$NGINX_STATUS" == "running" ]] && \
   [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]] && \
   [[ $DAYS_LEFT -gt 7 ]]; then
    echo "🎉 SSL Setup: ✅ COMPLETE"
    echo "   Your Nhandare API is secure with HTTPS!"
    echo "   Access via: https://$DOMAIN"
else
    echo "⚠️  SSL Setup: ❌ INCOMPLETE"
    echo "   Some tests failed. Please run the SSL setup script:"
    echo "   ./scripts/setup-ssl-ip.sh"
fi

echo ""
echo "🔧 Next Steps:"
if [[ "$NGINX_STATUS" != "running" ]]; then
    echo "   1. Start Nginx: docker start nhandare_nginx_prod"
fi
if [[ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    echo "   2. Generate SSL certificate: ./scripts/setup-ssl-ip.sh"
fi
if [[ $DAYS_LEFT -le 7 ]]; then
    echo "   3. Renew SSL certificate: ./renew-ssl.sh"
fi

echo ""
echo "🌐 Your API endpoints:"
echo "   Health: https://$DOMAIN/health"
echo "   API:    https://$DOMAIN/api/*"
echo "   Socket: https://$DOMAIN/socket.io/*"
