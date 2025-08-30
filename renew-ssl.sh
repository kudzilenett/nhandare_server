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
