# Chess-Focused Zimbabwean Nhandare Seeder

This is a comprehensive, production-ready seeder for the Nhandare Chess platform that follows industry best practices and creates realistic test data specifically for chess tournaments and Zimbabwean users.

## 🚀 Features

### **Comprehensive Chess Data Coverage**

- **100 Users** with realistic distribution (5% admins, 10% moderators, 85% regular users)
- **25 Chess Tournaments** across different statuses (20% active, 60% completed, 20% open)
- **Chess-Focused Gaming Ecosystem** with authentic chess openings, time controls, and venues
- **Realistic Payment System** with 95% success rate and failure scenarios
- **Full Chess Tournament Lifecycle** from registration to completion
- **Chess Matchmaking System** with queue and metrics
- **Content Moderation** and audit trails
- **Zimbabwe-Specific Data** (provinces, cities, institutions, mobile money, authentic names)

### **Industry Standards**

- **Configurable Scaling** - Easy to adjust data volumes
- **Realistic Data Distribution** - Follows real-world patterns
- **Comprehensive Error Handling** - Graceful failure and recovery
- **Performance Optimized** - Efficient database operations
- **Audit Trail** - Complete tracking of all operations
- **Modular Design** - Easy to maintain and extend

## 📊 Data Configuration

The seeder uses a configuration object that can be easily modified:

```typescript
const SEED_CONFIG = {
  USERS: {
    TOTAL: 100,                    // Total users to create
    ADMIN_PERCENTAGE: 0.05,        // 5% admins
    MODERATOR_PERCENTAGE: 0.10,    // 10% moderators
    STUDENT_PERCENTAGE: 0.60,      // 60% students
    VERIFIED_PERCENTAGE: 0.80,     // 80% verified
  },
  TOURNAMENTS: {
    TOTAL: 25,                     // Total tournaments
    ACTIVE_PERCENTAGE: 0.20,       // 20% active
    COMPLETED_PERCENTAGE: 0.60,    // 60% completed
    OPEN_PERCENTAGE: 0.20,         // 20% open
  },
  MATCHES: {
    PER_TOURNAMENT: 15,            // Matches per tournament
    COMPLETED_PERCENTAGE: 0.80,    // 80% completed
  },
  PAYMENTS: {
    SUCCESS_RATE: 0.95,            // 95% success rate
    FAILURE_REASONS: [...]         // Realistic failure scenarios
  }
};
```

## ♟️ Chess-Specific Features

This seeder is specifically designed for chess tournaments and includes:

### **Chess Game Data**

- **Authentic Chess Openings**: Sicilian Defense, Ruy Lopez, Queen's Gambit, King's Indian Defense, French Defense, Caro-Kann Defense, English Opening, Reti Opening
- **Realistic Time Controls**: 5+0, 10+5, 15+10, 30+0, 60+0
- **Zimbabwean Venues**: Online, Harare International Conference Centre, University of Zimbabwe, Bulawayo City Hall, Africa University, Mutare City Hall, Manicaland Provincial Complex, National University of Science and Technology
- **Chess-Specific Game Data**: Algebraic notation moves, realistic board positions, proper game outcomes

### **Zimbabwean User Names**

- **Shona Names**: Tatenda, Tinashe, Tafadzwa, Tendai, Tapiwa, Tonderai, Tawanda, Tendekai, Rutendo, Rumbidzai, Ruvimbo, Farai, Fadzai, Fungai, Chiedza, Munashe, Munyaradzi
- **Ndebele Names**: Sipho, Thabo, Nkosana
- **English Names**: Common names used in Zimbabwe (John, James, David, Mary, Patricia, Jennifer, Linda)
- **Authentic Surnames**: Moyo, Ndlovu, Shumba, Gumbo, Mazhindu, Chakanyuka, Mupfudza, Chiwenga, Mutasa, Mugabe, Tsvangirai, Mujuru, Mnangagwa

## 🗄️ Database Schema Coverage

This seeder creates data for **ALL** tables in the Nhandare schema:

### **Core Entities**

- ✅ `users` - Complete user profiles with roles and permissions (Zimbabwean names)
- ✅ `games` - Chess game with rules and settings
- ✅ `tournaments` - Full chess tournament lifecycle
- ✅ `matches` - Chess matches with realistic outcomes
- ✅ `tournament_players` - Player registrations and progress

### **Game System**

- ✅ `game_sessions` - Individual chess game sessions
- ✅ `game_statistics` - Chess player performance metrics
- ✅ `achievements` - Chess gamification system
- ✅ `user_achievements` - User progress tracking

### **Tournament Features**

- ✅ `tournament_events` - Real-time chess tournament updates
- ✅ `tournament_highlights` - Chess player achievements
- ✅ `tournament_spectators` - Chess audience engagement
- ✅ `challenge_invitations` - Chess player challenges

### **Payment & Financial**

- ✅ `payments` - Entry fees and prize payouts
- ✅ `mobile_money_providers` - Zimbabwe payment methods
- ✅ `institutions` - Universities and companies

### **Matchmaking & Analytics**

- ✅ `matchmaking_queue` - Chess player matching system
- ✅ `matchmaking_metrics` - Chess performance analytics

### **Moderation & Security**

- ✅ `flagged_content` - Content moderation
- ✅ `user_moderations` - User management
- ✅ `audit_logs` - Complete audit trail
- ✅ `user_activities` - User behavior tracking

## 🛠️ Usage

### **Prerequisites**

```bash
# Ensure database is running and migrations are applied
npm run db:migrate

# Generate Prisma client
npm run db:generate
```

### **Run the Seeder**

```bash
# Using ts-node
npx ts-node prisma/seed-industry-standard.ts

# Or add to package.json scripts
npm run seed:industry-standard
```

### **Customization**

```bash
# Modify SEED_CONFIG in the file to adjust data volumes
# Then run the seeder
npx ts-node prisma/seed-industry-standard.ts
```

## 📈 Data Volumes

### **Default Output**

- **Users**: 100 (5 admins, 10 moderators, 85 regular users)
- **Tournaments**: 25 (5 active, 15 completed, 5 open)
- **Matches**: ~375 (15 per tournament)
- **Payments**: ~500 (entry fees + prize payouts)
- **Game Statistics**: 400 (4 games × 100 users)
- **Achievements**: 6 (gamification system)
- **User Activities**: 800 (login + game activities)

### **Scaling Options**

```typescript
// For development/testing
USERS.TOTAL: 50
TOURNAMENTS.TOTAL: 10

// For production testing
USERS.TOTAL: 1000
TOURNAMENTS.TOTAL: 100

// For load testing
USERS.TOTAL: 10000
TOURNAMENTS.TOTAL: 500
```

## 🌍 Zimbabwe-Specific Features

### **Geographic Data**

- **10 Provinces** with realistic city distributions
- **Location-based tournaments** with venue information
- **Regional targeting** for different audience types

### **Institutional Integration**

- **Universities**: UZ, NUST, Africa University, MSU, etc.
- **Companies**: Econet, CBZ Bank, Delta Corporation
- **Student vs Professional** tournament categories

### **Payment Integration**

- **Mobile Money**: EcoCash, OneMoney, Telecash
- **Pesepay Integration** with realistic transaction IDs
- **Local Currency Support** (USD/ZWL)
- **Realistic Fee Structures** and limits

## 🔒 Security & Compliance

### **User Data**

- **Realistic Passwords** (hashed with bcrypt)
- **Role-based Access Control** (RBAC)
- **Permission Management** with granular controls
- **ID Verification** status tracking

### **Audit & Compliance**

- **Complete Audit Trail** for all operations
- **User Activity Logging** with IP addresses
- **Content Moderation** workflow
- **Payment Verification** and tracking

## 🧪 Testing Scenarios

This seeder creates data perfect for testing:

### **Tournament Lifecycle**

- Registration → Active → Completed
- Different bracket types (Single/Double elimination, Swiss, Round Robin)
- Prize distribution and payment processing

### **User Management**

- Role transitions and permissions
- Profile verification workflows
- Content moderation actions

### **Payment Processing**

- Successful transactions
- Failed payments with realistic reasons
- Prize payouts and refunds

### **Matchmaking System**

- Queue management
- Skill-based matching
- Performance metrics

### **Content Moderation**

- Flagged content workflow
- Moderator actions
- User suspensions and bans

## 🚨 Error Handling

The seeder includes comprehensive error handling:

- **Database Connection** failures
- **Data Validation** errors
- **Constraint Violations** (foreign keys, unique constraints)
- **Transaction Rollbacks** on failures
- **Detailed Logging** for debugging

## 📝 Maintenance

### **Adding New Data Types**

1. Add new function to create the data
2. Update the main() function to call it
3. Add to clearExistingData() if needed
4. Update the README documentation

### **Modifying Existing Data**

1. Update the configuration constants
2. Modify the data generation logic
3. Test with smaller volumes first
4. Update documentation

## 🔄 Reset & Cleanup

```bash
# Clear all seeded data
npm run db:reset

# Or manually truncate tables
npx ts-node prisma/seed-industry-standard.ts
```

## 📊 Performance Considerations

- **Batch Operations** for large datasets
- **Efficient Queries** with proper indexing
- **Transaction Management** for data consistency
- **Memory Management** for large operations

## 🎯 Best Practices

1. **Always backup** production data before seeding
2. **Test with small volumes** first
3. **Validate data integrity** after seeding
4. **Monitor database performance** during seeding
5. **Use appropriate indexes** for large datasets

## 🆘 Troubleshooting

### **Common Issues**

- **Memory errors**: Reduce data volumes
- **Timeout errors**: Increase database timeout
- **Constraint violations**: Check foreign key relationships
- **Connection errors**: Verify database connectivity

### **Debug Mode**

```typescript
// Add to the seeder for detailed logging
console.log("Debug:", { data, error });
```

## 📞 Support

For issues or questions about this seeder:

1. Check the error logs
2. Verify database schema matches
3. Test with minimal data first
4. Review the configuration settings

---

**This seeder is designed for production use and follows industry best practices for data generation, security, and performance.**
