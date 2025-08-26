# 🚀 Nhandare Backend Deployment Guide

This guide will walk you through deploying your Nhandare backend to EC2 using GitHub Actions.

## 📋 Prerequisites

- ✅ EC2 instance running Ubuntu (like the one you have: `i-0e43053b91648d7b5`)
- ✅ GitHub repository with your code
- ✅ SSH access to EC2 instance
- ✅ Domain name (optional, for HTTPS)

## 🎯 Quick Deployment Steps

### 1. Set up EC2 Instance

Connect to your EC2 instance and run the setup script:

```bash
# Connect to your EC2 instance
ssh -i your-key.pem ubuntu@51.20.12.21

# Clone your repository
git clone https://github.com/yourusername/nhandare_server.git
cd nhandare_server

# Make setup script executable and run it
chmod +x deploy/setup-ec2.sh
./deploy/setup-ec2.sh
```

### 2. Configure Environment Variables

Edit the production environment file:

```bash
nano .env.production
```

Fill in your real values:

```bash
# Database
POSTGRES_PASSWORD=your_strong_password_here
REDIS_PASSWORD=your_strong_redis_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long

# URLs
FRONTEND_URL=https://your-frontend-domain.com
ADMIN_PANEL_URL=https://admin.your-domain.com
SOCKET_CORS_ORIGIN=https://your-frontend-domain.com

# PesePay (Zimbabwe)
PESEPAY_INTEGRATION_KEY=your_real_pesepay_key
PESEPAY_ENCRYPTION_KEY=your_real_pesepay_encryption_key
```

### 3. Set up GitHub Actions Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions, and add:

| Secret Name    | Value                        |
| -------------- | ---------------------------- |
| `EC2_HOST`     | `51.20.12.21`                |
| `EC2_USERNAME` | `ubuntu`                     |
| `EC2_SSH_KEY`  | Your private SSH key content |
| `EC2_PORT`     | `22`                         |

### 4. Push to Deploy

```bash
# Commit and push your changes
git add .
git commit -m "Add deployment configuration"
git push origin main
```

GitHub Actions will automatically deploy to your EC2 instance! 🎉

## 🔧 Manual Deployment Commands

If you need to deploy manually:

```bash
# Build and start production services
make up-prod

# Check status
make status-prod

# View logs
make logs-prod

# Restart services
make restart-prod

# Stop services
make down-prod
```

## 🌐 Access Your Deployed API

- **API Base URL**: `http://51.20.12.21:3001`
- **Health Check**: `http://51.20.12.21:3001/health`
- **API Endpoints**: `http://51.20.12.21:3001/api/*`

## 🔒 Security Considerations

### Firewall Setup

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3001/tcp  # Backend API
sudo ufw enable
```

### SSL/HTTPS Setup

1. Get SSL certificates (Let's Encrypt)
2. Place them in `./ssl/` directory
3. Update nginx.conf with SSL configuration

## 📊 Monitoring

### Check Service Health

```bash
# All services
make status-prod

# Individual service logs
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs postgres
docker-compose -f docker-compose.prod.yml logs redis
docker-compose -f docker-compose.prod.yml logs nginx
```

### Database Management

```bash
# Run migrations
make db-migrate

# Seed data
make db-seed

# Open Prisma Studio
make db-studio
```

## 🚨 Troubleshooting

### Common Issues

| Problem                        | Solution                                      |
| ------------------------------ | --------------------------------------------- |
| **Port already in use**        | `sudo lsof -i :3001` then kill the process    |
| **Permission denied**          | `sudo chown -R $USER:$USER ~/nhandare_server` |
| **Database connection failed** | Check `.env.production` and restart services  |
| **Container won't start**      | Check logs with `make logs-prod`              |

### Debug Commands

```bash
# Check container status
docker ps -a

# Check container logs
docker logs nhandare_backend_prod

# Check system resources
htop
df -h
free -h

# Check network
netstat -tulpn | grep :3001
```

## 🔄 Update Deployment

To update your deployment:

1. **Push changes to main branch** - GitHub Actions will auto-deploy
2. **Manual update**:
   ```bash
   git pull origin main
   make down-prod
   make up-prod
   ```

## 📈 Scaling

### Horizontal Scaling

- Add more EC2 instances behind a load balancer
- Use AWS RDS for database
- Use AWS ElastiCache for Redis

### Vertical Scaling

- Increase EC2 instance size
- Optimize Docker resource limits
- Add more memory/CPU to containers

## 🎯 Next Steps

1. ✅ **Set up domain name** and point it to your EC2 IP
2. ✅ **Configure SSL certificates** for HTTPS
3. ✅ **Set up monitoring** (CloudWatch, etc.)
4. ✅ **Configure backups** for database
5. ✅ **Set up CI/CD pipeline** for staging environment

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review GitHub Actions logs
3. Check EC2 instance logs
4. Verify environment variables
5. Ensure ports are open in security groups

---

**🎉 Congratulations!** Your Nhandare backend is now deployed and accessible at `http://51.20.12.21:3001`
