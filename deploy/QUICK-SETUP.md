# 🚀 Quick EC2 Setup Guide

## **Step 1: Connect to EC2**

Double-click `connect-ec2.bat` or run this command:

```bash
ssh -i "C:\Users\KudziZvourerenexo\Downloads\nhandare.pem" ubuntu@51.20.12.21
```

## **Step 2: Run the Setup Script**

Once connected to EC2, run:

```bash
# Clone the repository
git clone https://github.com/kudzilenett/nhandare_server.git
cd nhandare_server

# Make the setup script executable
chmod +x deploy/setup-ec2.sh

# Run the setup script
./deploy/setup-ec2.sh
```

## **Step 3: Edit Environment Variables**

After setup completes:

```bash
nano .env.production
```

**IMPORTANT**: Edit these values:

- `DATABASE_URL`: Set a strong PostgreSQL password
- `JWT_SECRET`: Generate a random string (use: `openssl rand -base64 32`)
- `PESEPAY_INTEGRATION_KEY`: Your actual Pesepay key
- `PESEPAY_ENCRYPTION_KEY`: Your actual Pesepay encryption key

## **Step 4: Restart Services**

```bash
docker-compose -f docker-compose.prod.yml restart
```

## **Step 5: Test Your API**

```bash
# Test locally on EC2
curl http://localhost:3001/health

# Test from your local machine
curl http://51.20.12.21:3001/health
```

## **Step 6: Open Port 3001**

In AWS Console → EC2 → Security Groups → Your Instance's Security Group:

- Add inbound rule: Port 3001, Source 0.0.0.0/0

## **Step 7: Push to GitHub**

After everything works:

```bash
# On your local machine
git add .
git commit -m "EC2 setup complete"
git push origin main
```

This will trigger the GitHub Actions deployment!

## **Troubleshooting**

- Check logs: `docker-compose -f docker-compose.prod.yml logs -f`
- Check status: `docker-compose -f docker-compose.prod.yml ps`
- Restart services: `docker-compose -f docker-compose.prod.yml restart`

## **Need Help?**

The setup script will show detailed progress and any errors. Just follow the prompts!
