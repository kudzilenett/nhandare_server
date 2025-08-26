# Nhandare Backend - Docker Quick Start

This guide shows you how to run the Nhandare gaming platform backend using Docker.

## 🚀 Quick Start (Most Important Commands)

### 1. Start Development Environment

```bash
make up-dev
```

This starts PostgreSQL, Redis, and the backend server.

### 2. Check if everything is working

```bash
make status-dev
```

You should see all containers as "healthy" or "Up".

### 3. Test the backend

```bash
curl http://localhost:3001/health
```

Should return a JSON response with status "OK".

### 4. Stop everything when done

```bash
make down-dev
```

## 📋 What Gets Started

- **Backend API**: http://localhost:3001
- **PostgreSQL Database**: localhost:5432
- **Redis Cache**: localhost:6379
- **Health Check**: http://localhost:3001/health

## 🛠️ Essential Commands

| Command            | What it does                  |
| ------------------ | ----------------------------- |
| `make up-dev`      | Start development environment |
| `make down-dev`    | Stop development environment  |
| `make status-dev`  | Check container status        |
| `make logs-dev`    | View backend logs             |
| `make restart-dev` | Restart backend only          |

## 🔧 Troubleshooting

### Backend won't start?

1. Check if ports 3001, 5432, 6379 are free
2. Run `make logs-dev` to see error messages
3. Try `make down-dev` then `make up-dev`

### Database issues?

```bash
make db-migrate    # Run database migrations
make db-seed       # Add sample data
```

### Port already in use?

```bash
# Check what's using port 3001
lsof -i :3001
# or
netstat -tulpn | grep :3001
```

## 📁 Project Structure

```
nhandare_server/
├── docker-compose.yml          # Production config
├── docker-compose.dev.yml      # Development config
├── src/                        # Backend source code
├── prisma/                     # Database schema & migrations
└── Makefile                    # Convenience commands
```

## 🌍 Environment Variables

The development environment automatically sets:

- Database connection
- JWT secrets
- CORS settings
- Payment API keys (dev values)

**No .env file needed for development!**

## 🗄️ Database Management

```bash
make db-migrate    # Apply database changes
make db-seed       # Add sample data
make db-studio     # Open database browser
make db-reset      # Reset database (⚠️ deletes all data)
```

## 📊 Monitoring

```bash
make status-dev    # Container health
make logs-dev      # Real-time logs
curl localhost:3001/health  # API health check
```

## 🚫 Common Issues & Solutions

| Problem                      | Solution                            |
| ---------------------------- | ----------------------------------- |
| "Port already in use"        | Stop other services using the ports |
| "Container unhealthy"        | Check logs with `make logs-dev`     |
| "Database connection failed" | Run `make db-migrate`               |
| "Module not found"           | Restart with `make restart-dev`     |

## 🔄 Development Workflow

1. **Start**: `make up-dev`
2. **Code**: Make changes (auto-reloads)
3. **Test**: `curl localhost:3001/health`
4. **Stop**: `make down-dev`

## 📚 Need More Help?

- **Container logs**: `make logs-dev`
- **Shell access**: `docker exec -it nhandare_backend sh`
- **Database access**: `docker exec -it nhandare_postgres psql -U nhandare_user -d nhandare_gaming`

## 🎯 Production

For production deployment, use:

```bash
make up-prod          # Start production environment
make status-prod       # Check production status
make logs-prod         # View production logs
make restart-prod       # Restart production services
```

**Production Setup**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete EC2 deployment guide!

**Remember**: Set real environment variables for production!

---

**That's it!** Start with `make up-dev` and you'll have a working backend in minutes.
