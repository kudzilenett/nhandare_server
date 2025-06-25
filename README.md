# Gaming Platform Backend

A fully functional backend for the MrBeast-style competitive gaming platform.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:

```bash
# Copy from env.example and modify as needed
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRE="7d"
PORT=3001
NODE_ENV="development"
FRONTEND_URL="http://localhost:8081"
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
SOCKET_CORS_ORIGIN="http://localhost:8081"
```

3. Generate Prisma client:

```bash
npm run db:generate
```

4. Create and migrate database:

```bash
npm run db:push
```

5. Seed the database:

```bash
npm run db:seed
```

6. Start development server:

```bash
npm run dev
```

## 🎮 API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Games

- `GET /api/games` - List all games
- `GET /api/games/:id` - Get game details

### Tournaments

- `GET /api/tournaments` - List tournaments
- `POST /api/tournaments` - Create tournament
- `POST /api/tournaments/:id/join` - Join tournament

### Matches

- `GET /api/matches` - List user matches
- `POST /api/matches` - Create match
- `PUT /api/matches/:id` - Update match

### Leaderboard

- `GET /api/leaderboard/local` - Local leaderboard
- `GET /api/leaderboard/global` - Global leaderboard

## 🔌 WebSocket Events

- `connection` - User connects
- `disconnect` - User disconnects
- `join-game` - Join game room
- `game-move` - Make game move
- `game-end` - Game finished

## 🗄️ Database Schema

The backend uses Prisma ORM with SQLite for development (easily changeable to PostgreSQL for production).

Key models:

- `User` - User accounts and profiles
- `Game` - Available games (Chess, Checkers, etc.)
- `Tournament` - Tournament information and brackets
- `Match` - Individual game matches
- `GameSession` - Live game sessions
- `GameStatistic` - User statistics per game
- `Achievement` - User achievements
- `Payment` - Tournament payments and prizes

## 🔧 Development

### Database Operations

```bash
# Reset database
npm run db:push --force-reset

# View database
npm run db:studio

# Seed with test data
npm run db:seed
```

### Testing the API

Use tools like Postman or curl to test endpoints:

```bash
# Health check
curl http://localhost:3001/health

# Register user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"password123","location":"New York, NY"}'
```

## 🎯 Features Implemented

✅ **Authentication & Authorization**

- JWT-based authentication
- Password hashing with bcrypt
- Protected routes

✅ **Database Integration**

- Prisma ORM with full schema
- Seed data for testing
- Relationships and constraints

✅ **Security**

- Helmet for security headers
- CORS configuration
- Rate limiting
- Input validation

✅ **Real-time Features**

- Socket.io integration
- Game rooms and events

✅ **API Structure**

- RESTful endpoints
- Proper error handling
- Async/await patterns

## 🚀 Production Deployment

For production, update:

1. **Database**: Change to PostgreSQL

```env
DATABASE_URL="postgresql://username:password@localhost:5432/gamedb"
```

2. **Environment**: Update all secrets and URLs

3. **Security**: Enable HTTPS, update CORS origins

4. **Monitoring**: Add logging and monitoring tools

## 📊 Next Steps

- [ ] Implement payment processing (Stripe)
- [ ] Add email verification
- [ ] Location-based tournament matching
- [ ] Advanced game AI
- [ ] Tournament bracket generation
- [ ] Push notifications
- [ ] Admin dashboard
