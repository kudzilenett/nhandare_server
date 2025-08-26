#!/bin/bash

# Generate SSL certificates for Nginx (Development/Testing only)
# For production, use proper SSL certificates from a trusted CA

set -e

SSL_DIR="./ssl"
CERT_FILE="$SSL_DIR/cert.pem"
KEY_FILE="$SSL_DIR/key.pem"

echo "Generating SSL certificates for Nginx..."

# Create SSL directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=ZW/ST=Harare/L=Harare/O=Nhandare Gaming/OU=Development/CN=localhost"

# Set proper permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo "SSL certificates generated successfully!"
echo "Certificate: $CERT_FILE"
echo "Private Key: $KEY_FILE"
echo ""
echo "⚠️  WARNING: These are self-signed certificates for development only!"
echo "   For production, use certificates from a trusted Certificate Authority."
echo ""
echo "To use with Nginx, ensure these files are mounted in docker-compose.yml:"
echo "  - ./ssl:/etc/nginx/ssl:ro"
