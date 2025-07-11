# 🏆 Tournament Testing Guide

## Quick Setup for Active Tournament Testing

This guide will help you seed an active chess tournament with current dates so you can test the tournament functionality.

### Prerequisites

1. Make sure your PostgreSQL database is running
2. Run the normal seed first (optional, but recommended for full data):
   ```bash
   cd nhandare_server
   npm run seed
   ```

### Seed Active Tournament for Testing

Run this command to create an active tournament with current dates:

```bash
cd nhandare_server
npm run seed:active-tournament
```

This will create:

- ✅ **1 Active Tournament** ("Nhandare Chess Championship 2025 - LIVE")
- 👥 **8 Test Players** (or use existing users if available)
- ⚔️ **4 First Round Matches** (2 completed, 2 pending)
- 💳 **Entry Fee Payments** (all completed)
- 📊 **Game Statistics** for all players

### What You Can Test

After seeding, you can:

1. **View Tournament**: Navigate to tournaments tab and see the active tournament
2. **Browse Bracket**: See completed matches (with winners) and pending matches
3. **Play Matches**: Click "Play Match" on pending matches to start chess games
4. **Test Chess Flow**: Play through a complete chess match
5. **Bracket Progression**: Complete matches will automatically update the bracket
6. **Tournament Navigation**: Test back/forth navigation between tournament and chess

### Tournament Details

- **Status**: ACTIVE (currently running)
- **Players**: 8/8 registered
- **Prize Pool**: $500 USD
- **Entry Fee**: $25 USD
- **Format**: Single Elimination
- **Location**: Harare, Zimbabwe
- **Dates**: Started 1 hour ago, ends in 3 days

### Test User Login

If new users were created, you can log in as any test player:

- **Username**: `TestPlayer1`, `TestPlayer2`, etc.
- **Password**: `password123`
- **Email**: `testplayer1@nhandare.co.zw`, etc.

### Clean Up

To clean up and re-seed:

```bash
# Re-run the full seed (will clean everything)
npm run seed

# Or just re-run the active tournament seed
npm run seed:active-tournament
```

### Troubleshooting

1. **Database connection errors**: Make sure PostgreSQL is running
2. **Prisma errors**: Try `npx prisma generate && npx prisma db push`
3. **No matches to play**: The script creates 2 pending matches, look for them in the bracket

Happy testing! 🚀
