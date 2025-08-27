# Nhandare Production Setup Guide

This guide covers the production-ready Docker setup for the Nhandare gaming platform.

## 🚀 Quick Start

### 1. Start Production Services

```bash
# Make the script executable
chmod +x scripts/prod-manager.sh

# Start all services
./scripts/prod-manager.sh start

# Check status
./scripts/prod-manager.sh status
```

### 2. Start Monitoring Stack

```bash
# Start monitoring (Prometheus, Grafana, cAdvisor, Node Exporter)
./scripts/prod-manager.sh monitoring start
```

## 📊 Monitoring Dashboard Access

- **Grafana**: http://your-server:3000 (admin/admin123)
- **Prometheus**: http://your-server:9090
- **cAdvisor**: http://your-server:8080
- **Node Exporter**: http://your-server:9100

## 🛠️ Management Commands

```bash
# Service Management
./scripts/prod-manager.sh start          # Start all services
./scripts/prod-manager.sh stop           # Stop all services
./scripts/prod-manager.sh restart        # Restart all services
./scripts/prod-manager.sh status         # Show service status

# Monitoring
./scripts/prod-manager.sh monitoring start   # Start monitoring stack
./scripts/prod-manager.sh monitoring stop    # Stop monitoring stack

# Maintenance
./scripts/prod-manager.sh logs [service]    # Show logs
./scripts/prod-manager.sh backup            # Database backup
./scripts/prod-manager.sh update            # Update services
```

## 🔧 Production Features

### Resource Management

- **Memory Limits**: Prevents resource exhaustion
- **CPU Limits**: Ensures fair resource allocation
- **Log Rotation**: Automatic log management

### Health Checks

- **Database**: PostgreSQL connectivity
- **Redis**: Cache service health
- **Backend**: Application health endpoint
- **Nginx**: Reverse proxy health

### Auto-Recovery

- **Restart Policies**: Automatic service recovery
- **Health Monitoring**: Service dependency management
- **Graceful Shutdown**: Proper container termination

## 📈 Monitoring & Observability

### Metrics Collection

- **Application Metrics**: Custom health endpoints
- **System Metrics**: CPU, memory, disk usage
- **Container Metrics**: Docker container performance
- **Database Metrics**: Query performance, connections

### Alerting (Future Enhancement)

- **Prometheus Alertmanager**: Configure alert rules
- **Slack/Email Notifications**: Team notifications
- **PagerDuty Integration**: On-call escalation

## 🔒 Security Features

### Network Security

- **Internal Network**: Services isolated from host
- **Port Binding**: Only necessary ports exposed
- **SSL/TLS**: HTTPS encryption with Let's Encrypt

### Access Control

- **Environment Variables**: Secure configuration
- **Database Isolation**: Local-only database access
- **Redis Authentication**: Password-protected cache

## 📁 File Structure

```
nhandare_server/
├── docker-compose.prod.yml          # Production services
├── docker-compose.monitoring.yml    # Monitoring stack
├── scripts/
│   └── prod-manager.sh             # Management script
├── monitoring/
│   ├── prometheus.yml              # Prometheus config
│   └── grafana/                    # Grafana dashboards
├── ssl/                            # SSL certificates
├── uploads/                        # File uploads
└── logs/                           # Application logs
```

## 🚨 Troubleshooting

### Common Issues

1. **Services Won't Start**

   ```bash
   # Check logs
   ./scripts/prod-manager.sh logs

   # Check specific service
   ./scripts/prod-manager.sh logs backend
   ```

2. **Database Connection Issues**

   ```bash
   # Verify database is running
   docker exec nhandare_postgres_prod pg_isready

   # Check environment variables
   docker exec nhandare_backend_prod env | grep DATABASE
   ```

3. **Memory Issues**

   ```bash
   # Check resource usage
   ./scripts/prod-manager.sh status

   # View container stats
   docker stats
   ```

### Health Check Endpoints

- **Backend Health**: `http://your-server:3001/health`
- **Metrics**: `http://your-server:3001/metrics`
- **Nginx Health**: `http://your-server/health`

## 🔄 Backup & Recovery

### Database Backups

```bash
# Create backup
./scripts/prod-manager.sh backup

# Manual backup
docker exec nhandare_postgres_prod pg_dump -U nhandare_user nhandare_gaming > backup.sql
```

### Volume Backups

```bash
# Backup volumes
docker run --rm -v nhandare_server_postgres_prod_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .
docker run --rm -v nhandare_server_redis_prod_data:/data -v $(pwd):/backup alpine tar czf /backup/redis_backup.tar.gz -C /data .
```

## 📊 Performance Tuning

### Database Optimization

- **Connection Pooling**: Configure Prisma connection limits
- **Query Optimization**: Monitor slow queries
- **Index Management**: Regular index maintenance

### Redis Optimization

- **Memory Policy**: LRU eviction for cache
- **Persistence**: AOF for data durability
- **Connection Pooling**: Optimize Redis connections

### Application Optimization

- **Rate Limiting**: Configure request limits
- **Caching Strategy**: Implement Redis caching
- **Log Levels**: Production-appropriate logging

## 🔮 Future Enhancements

### Phase 2: Advanced Monitoring

- **Distributed Tracing**: Jaeger integration
- **Log Aggregation**: ELK stack or Loki
- **Custom Dashboards**: Business metrics

### Phase 3: Orchestration

- **Kubernetes**: Container orchestration
- **Service Mesh**: Istio or Linkerd
- **Auto-scaling**: Horizontal pod autoscaler

### Phase 4: CI/CD Pipeline

- **GitHub Actions**: Automated deployments
- **Docker Registry**: Private image storage
- **Blue-Green Deployments**: Zero-downtime updates

## 📞 Support

For production issues:

1. Check logs: `./scripts/prod-manager.sh logs`
2. Verify status: `./scripts/prod-manager.sh status`
3. Check monitoring dashboards
4. Review this documentation

## 📝 Environment Variables

Required environment variables in `.env`:

```bash
POSTGRES_PASSWORD=your_secure_password
REDIS_PASSWORD=your_redis_password
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=7d
FRONTEND_URL=https://your-frontend.com
ADMIN_PANEL_URL=https://your-admin.com
SOCKET_CORS_ORIGIN=https://your-frontend.com
PESEPAY_INTEGRATION_KEY=your_pesepay_key
PESEPAY_ENCRYPTION_KEY=your_pesepay_encryption_key
```

## 🎯 Best Practices

1. **Regular Backups**: Daily database backups
2. **Monitoring**: Check dashboards regularly
3. **Updates**: Keep images updated
4. **Security**: Rotate secrets regularly
5. **Documentation**: Update this guide as needed
