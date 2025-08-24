import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { BracketGenerationService } from "../src/services/BracketGenerationService";

const prisma = new PrismaClient();

// Industry-standard configuration constants
const SEED_CONFIG = {
  USERS: {
    TOTAL: 100,
    ADMIN_PERCENTAGE: 0.05, // 5% admins
    MODERATOR_PERCENTAGE: 0.1, // 10% moderators
    STUDENT_PERCENTAGE: 0.6, // 60% students
    VERIFIED_PERCENTAGE: 0.8, // 80% verified
  },
  TOURNAMENTS: {
    TOTAL: 25,
    ACTIVE_PERCENTAGE: 0.2, // 20% active
    COMPLETED_PERCENTAGE: 0.6, // 60% completed
    OPEN_PERCENTAGE: 0.2, // 20% open
    // Bracket type distribution for comprehensive testing
    BRACKET_TYPES: {
      SINGLE_ELIMINATION: 0.4, // 40% - most common
      DOUBLE_ELIMINATION: 0.25, // 25% - popular for fairness
      ROUND_ROBIN: 0.2, // 20% - good for small groups
      SWISS: 0.15, // 15% - efficient for large groups
    },
    // Advanced seeding distribution
    ADVANCED_SEEDING_PERCENTAGE: 0.7, // 70% use advanced seeding
  },
  MATCHES: {
    PER_TOURNAMENT: 15,
    COMPLETED_PERCENTAGE: 0.8, // 80% completed
  },
  PAYMENTS: {
    SUCCESS_RATE: 0.95, // 95% success rate
    FAILURE_REASONS: [
      "Insufficient funds",
      "Network timeout",
      "Invalid mobile number",
      "Provider service unavailable",
      "Daily limit exceeded",
    ],
  },
  CHESS: {
    OPENINGS: [
      "Sicilian Defense",
      "Ruy Lopez",
      "Queen's Gambit",
      "King's Indian Defense",
      "French Defense",
      "Caro-Kann Defense",
      "English Opening",
      "Reti Opening",
    ],
    TIME_CONTROLS: ["5+0", "10+5", "15+10", "30+0", "60+0"],
    VENUES: [
      "Online",
      "Harare International Conference Centre",
      "University of Zimbabwe",
      "Bulawayo City Hall",
      "Africa University",
      "Mutare City Hall",
      "Manicaland Provincial Complex",
      "National University of Science and Technology",
    ],
  },
  // New: Advanced seeding configuration
  SEEDING: {
    PERFORMANCE_WEIGHTS: {
      RATING: 0.4, // Base rating weight
      PERFORMANCE: 0.25, // Recent performance
      HISTORY: 0.2, // Tournament history
      REGIONAL: 0.1, // Regional factors
      CONSISTENCY: 0.05, // Performance consistency
    },
    REGIONAL_RADIUS_RANGE: [50, 200], // km
    RECENT_TOURNAMENTS_RANGE: [3, 10],
    CONSISTENCY_SCORE_RANGE: [0.6, 1.0],
    REGIONAL_STRENGTH_RANGE: [0.5, 1.0],
  },
  // New: Bracket testing configuration
  BRACKET_TESTING: {
    PLAYER_COUNTS: [8, 16, 32, 64, 128], // Test various tournament sizes
    ENSURE_ALL_TYPES: true, // Guarantee at least one tournament of each bracket type
    TEST_ADVANCED_SEEDING: true, // Test advanced seeding configurations
    VALIDATION_TESTING: true, // Test bracket validation systems
  },
};

// Zimbabwe-specific data
const ZIMBABWE_DATA = {
  PROVINCES: [
    "Harare",
    "Bulawayo",
    "Manicaland",
    "Mashonaland Central",
    "Mashonaland East",
    "Mashonaland West",
    "Masvingo",
    "Matabeleland North",
    "Matabeleland South",
    "Midlands",
  ],
  NAMES: {
    FIRST_NAMES: [
      // Shona names
      "Tatenda",
      "Tinashe",
      "Tafadzwa",
      "Tendai",
      "Tapiwa",
      "Tonderai",
      "Tawanda",
      "Tendekai",
      "Rutendo",
      "Rumbidzai",
      "Ruvimbo",
      "Rutendo",
      "Rumbidzai",
      "Ruvimbo",
      "Rutendo",
      "Rumbidzai",
      "Farai",
      "Fadzai",
      "Fungai",
      "Fadzai",
      "Fungai",
      "Fadzai",
      "Fungai",
      "Fadzai",
      "Chiedza",
      "Chiedza",
      "Chiedza",
      "Chiedza",
      "Chiedza",
      "Chiedza",
      "Chiedza",
      "Chiedza",
      "Munashe",
      "Munyaradzi",
      "Munashe",
      "Munyaradzi",
      "Munashe",
      "Munyaradzi",
      "Munashe",
      "Munyaradzi",
      // Ndebele names
      "Sipho",
      "Sipho",
      "Sipho",
      "Sipho",
      "Sipho",
      "Sipho",
      "Sipho",
      "Sipho",
      "Thabo",
      "Thabo",
      "Thabo",
      "Thabo",
      "Thabo",
      "Thabo",
      "Thabo",
      "Thabo",
      "Nkosana",
      "Nkosana",
      "Nkosana",
      "Nkosana",
      "Nkosana",
      "Nkosana",
      "Nkosana",
      "Nkosana",
      // English names common in Zimbabwe
      "John",
      "James",
      "David",
      "Michael",
      "Robert",
      "William",
      "Richard",
      "Joseph",
      "Mary",
      "Patricia",
      "Jennifer",
      "Linda",
      "Elizabeth",
      "Barbara",
      "Susan",
      "Jessica",
    ],
    LAST_NAMES: [
      // Shona surnames
      "Moyo",
      "Ndlovu",
      "Shumba",
      "Gumbo",
      "Mazhindu",
      "Chakanyuka",
      "Mupfudza",
      "Chiwenga",
      "Mutasa",
      "Mugabe",
      "Tsvangirai",
      "Mujuru",
      "Mugabe",
      "Tsvangirai",
      "Mujuru",
      "Mugabe",
      "Chiwenga",
      "Mnangagwa",
      "Chiwenga",
      "Mnangagwa",
      "Chiwenga",
      "Mnangagwa",
      "Chiwenga",
      "Mnangagwa",
      "Moyo",
      "Ndlovu",
      "Shumba",
      "Gumbo",
      "Mazhindu",
      "Chakanyuka",
      "Mupfudza",
      "Chiwenga",
      // Ndebele surnames
      "Ndlovu",
      "Ndlovu",
      "Ndlovu",
      "Ndlovu",
      "Ndlovu",
      "Ndlovu",
      "Ndlovu",
      "Ndlovu",
      "Moyo",
      "Moyo",
      "Moyo",
      "Moyo",
      "Moyo",
      "Moyo",
      "Moyo",
      "Moyo",
      // English surnames common in Zimbabwe
      "Smith",
      "Jones",
      "Brown",
      "Taylor",
      "Johnson",
      "Williams",
      "Davis",
      "Miller",
      "Wilson",
      "Moore",
      "Anderson",
      "Thomas",
      "Jackson",
      "White",
      "Harris",
      "Martin",
    ],
  },
  CITIES: {
    Harare: ["Harare", "Chitungwiza", "Epworth", "Ruwa", "Norton"],
    Bulawayo: ["Bulawayo", "Luveve", "Pumula", "Entumbane"],
    Manicaland: ["Mutare", "Rusape", "Chipinge", "Nyanga", "Chimanimani"],
    "Mashonaland Central": [
      "Bindura",
      "Mount Darwin",
      "Guruve",
      "Shamva",
      "Mazowe",
    ],
    "Mashonaland East": ["Marondera", "Macheke", "Wedza", "Mudzi", "Uzumba"],
    "Mashonaland West": ["Chinhoyi", "Kariba", "Norton", "Chegutu", "Kadoma"],
    Masvingo: ["Masvingo", "Chivi", "Bikita", "Zaka", "Gutu"],
    "Matabeleland North": [
      "Hwange",
      "Victoria Falls",
      "Binga",
      "Lupane",
      "Nkayi",
    ],
    "Matabeleland South": [
      "Gwanda",
      "Beitbridge",
      "Plumtree",
      "Filabusi",
      "Insiza",
    ],
    Midlands: ["Gweru", "Kwekwe", "Redcliff", "Shurugwi", "Zvishavane"],
  },
  INSTITUTIONS: [
    {
      name: "University of Zimbabwe",
      type: "university",
      city: "Harare",
      province: "Harare",
    },
    {
      name: "National University of Science and Technology",
      type: "university",
      city: "Bulawayo",
      province: "Bulawayo",
    },
    {
      name: "Africa University",
      type: "university",
      city: "Mutare",
      province: "Manicaland",
    },
    {
      name: "Midlands State University",
      type: "university",
      city: "Gweru",
      province: "Midlands",
    },
    {
      name: "Bindura University of Science Education",
      type: "university",
      city: "Bindura",
      province: "Mashonaland Central",
    },
    {
      name: "Great Zimbabwe University",
      type: "university",
      city: "Masvingo",
      province: "Masvingo",
    },
    {
      name: "Lupane State University",
      type: "university",
      city: "Lupane",
      province: "Matabeleland North",
    },
    {
      name: "Econet Wireless Zimbabwe",
      type: "company",
      city: "Harare",
      province: "Harare",
    },
    { name: "CBZ Bank", type: "company", city: "Harare", province: "Harare" },
    {
      name: "Delta Corporation",
      type: "company",
      city: "Harare",
      province: "Harare",
    },
  ],
  MOBILE_MONEY_PROVIDERS: [
    { name: "EcoCash", code: "ECOCASH", minAmount: 1.0, maxAmount: 10000.0 },
    { name: "OneMoney", code: "ONEMONEY", minAmount: 1.0, maxAmount: 5000.0 },
    { name: "Telecash", code: "TELECASH", minAmount: 1.0, maxAmount: 3000.0 },
  ],
};

// Utility functions
function generateZimbabwePhone(): string {
  const prefixes = ["263771", "263772", "263773", "263774", "263778"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = Math.floor(Math.random() * 900000) + 100000;
  return `+${prefix}${suffix}`;
}

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

async function main() {
  console.log("🚀 Starting Chess-Focused Zimbabwean Nhandare Seeding...");
  console.log("📊 Configuration:", SEED_CONFIG);

  try {
    // Clear existing data
    await clearExistingData();
    console.log("✅ Database cleared");

    // Create core data
    const games = await createGames();
    console.log("✅ Chess game created:", games.length);

    const institutions = await createInstitutions();
    console.log("✅ Institutions created:", institutions.length);

    const mobileMoneyProviders = await createMobileMoneyProviders();
    console.log(
      "✅ Mobile money providers created:",
      mobileMoneyProviders.length
    );

    const users = await createUsers(institutions);
    console.log("✅ Users created:", users.length);

    const tournaments = await createTournaments(games, users);
    console.log("✅ Tournaments created:", tournaments.length);

    const tournamentPlayers = await createTournamentPlayers(tournaments, users);
    console.log("✅ Tournament players created:", tournamentPlayers.length);

    // Generate brackets for all tournaments using BracketGenerationService
    // Generate brackets for all tournaments using BracketGenerationService
    console.log("🏆 Generating tournament brackets...");
    for (const tournament of tournaments) {
      try {
        // Get the actual player count for this tournament
        const playerCount = await prisma.tournamentPlayer.count({
          where: { tournamentId: tournament.id },
        });

        if (playerCount >= 2) {
          await BracketGenerationService.generateBracket(tournament.id, true); // Use advanced seeding
          console.log(
            `   ✅ Bracket generated for tournament: ${tournament.title} (${playerCount} players)`
          );
        } else {
          console.log(
            `   ⚠️  Skipping bracket generation for tournament: ${tournament.title} (${playerCount} players - insufficient)`
          );
        }
      } catch (error) {
        console.error(
          `   ❌ Failed to generate bracket for tournament: ${tournament.title}`,
          error
        );
      }
    }
    console.log("✅ Tournament brackets generated");

    const matches = await createMatches(tournaments, users);
    console.log("✅ Matches created:", matches.length);

    const gameSessions = await createGameSessions(matches, users, games);
    console.log("✅ Game sessions created:", gameSessions.length);

    const gameStatistics = await createGameStatistics(users, games);
    console.log("✅ Game statistics created:", gameStatistics.length);

    const achievements = await createAchievements();
    console.log("✅ Achievements created:", achievements.length);

    const userAchievements = await createUserAchievements(users, achievements);
    console.log("✅ User achievements created:", userAchievements.length);

    const payments = await createPayments(users, tournaments);
    console.log("✅ Payments created:", payments.length);

    const matchmakingQueue = await createMatchmakingQueue(users, games);
    console.log("✅ Matchmaking queue created:", matchmakingQueue.length);

    const matchmakingMetrics = await createMatchmakingMetrics(games);
    console.log("✅ Matchmaking metrics created:", matchmakingMetrics.length);

    const tournamentEvents = await createTournamentEvents(tournaments, users);
    console.log("✅ Tournament events created:", tournamentEvents.length);

    const tournamentHighlights = await createTournamentHighlights(
      tournaments,
      users
    );
    console.log(
      "✅ Tournament highlights created:",
      tournamentHighlights.length
    );

    const tournamentSpectators = await createTournamentSpectators(
      tournaments,
      users
    );
    console.log(
      "✅ Tournament spectators created:",
      tournamentSpectators.length
    );

    const userActivities = await createUserActivities(users);
    console.log("✅ User activities created:", userActivities.length);

    const flaggedContent = await createFlaggedContent(users);
    console.log("✅ Flagged content created:", flaggedContent.length);

    const userModerations = await createUserModerations(users);
    console.log("✅ User moderations created:", userModerations.length);

    const auditLogs = await createAuditLogs(users);
    console.log("✅ Audit logs created:", auditLogs.length);

    const challengeInvitations = await createChallengeInvitations(users, games);
    console.log(
      "✅ Challenge invitations created:",
      challengeInvitations.length
    );

    console.log(
      "\n🎉 Chess-Focused Zimbabwean Seeding Completed Successfully!"
    );
    console.log("📈 Total Records Created:");
    console.log(`   👥 Users: ${users.length}`);
    console.log(`   ♟️ Chess Tournaments: ${tournaments.length}`);
    console.log(`   🎮 Chess Matches: ${matches.length}`);
    console.log(`   💰 Payments: ${payments.length}`);
    console.log(`   📊 Chess Statistics: ${gameStatistics.length}`);

    // Show bracket type distribution
    const bracketTypeCounts = tournaments.reduce((acc, t) => {
      acc[t.bracketType] = (acc[t.bracketType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log("\n🎯 Bracket System Testing Coverage:");
    console.log("   ✅ All 4 bracket types created for comprehensive testing:");
    Object.entries(bracketTypeCounts).forEach(([type, count]) => {
      console.log(`      ${type}: ${count} tournaments`);
    });

    console.log("\n🚀 Ready for bracket system testing!");
    console.log("   • Single Elimination: Basic bracket progression");
    console.log("   • Double Elimination: Winners/losers brackets");
    console.log("   • Round Robin: Berger tables with optimal pairing");
    console.log("   • Swiss System: Score-based pairing algorithms");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
}

async function clearExistingData() {
  const tables = [
    "audit_logs",
    "user_moderations",
    "flagged_content",
    "user_activities",
    "tournament_spectators",
    "tournament_highlights",
    "tournament_events",
    "matchmaking_metrics",
    "matchmaking_queue",
    "user_achievements",
    "achievements",
    "game_statistics",
    "game_sessions",
    "challenge_invitations",
    "matches",
    "tournament_players",
    "payments",
    "tournaments",
    "users",
    "institutions",
    "mobile_money_providers",
    "games",
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
  }
}

async function createGames() {
  const gamesData = [
    {
      name: "Chess",
      description:
        "Strategic board game for two players with deep tactical gameplay. The ultimate test of strategy, tactics, and mental endurance.",
      emoji: "♟️",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 1800000, // 30 minutes
      rules: {
        timeControl: "10+5",
        format: "Standard",
        specialRules: ["Castling", "En passant", "Pawn promotion"],
        drawConditions: [
          "Stalemate",
          "Threefold repetition",
          "Fifty-move rule",
        ],
      },
      settings: {
        allowDraw: true,
        autoPromote: false,
        moveValidation: true,
        notation: "Algebraic",
      },
    },
  ];

  const games: any[] = [];
  for (const gameData of gamesData) {
    const game = await prisma.game.create({ data: gameData });
    games.push(game);
  }
  return games;
}

async function createInstitutions() {
  const institutions: any[] = [];
  for (const instData of ZIMBABWE_DATA.INSTITUTIONS) {
    const institution = await prisma.institution.create({
      data: {
        ...instData,
        isActive: true,
        totalUsers: 0,
        totalTournaments: 0,
      },
    });
    institutions.push(institution);
  }
  return institutions;
}

async function createMobileMoneyProviders() {
  const providers: any[] = [];
  for (const providerData of ZIMBABWE_DATA.MOBILE_MONEY_PROVIDERS) {
    const provider = await prisma.mobileMoneyProvider.create({
      data: {
        ...providerData,
        isActive: true,
        feeStructure: {
          transactionFee: 0.02, // 2% fee
          minimumFee: 0.1,
          maximumFee: 5.0,
        },
      },
    });
    providers.push(provider);
  }
  return providers;
}

async function createUsers(institutions: any[]) {
  const users: any[] = [];
  const totalUsers = SEED_CONFIG.USERS.TOTAL;
  const adminCount = Math.floor(
    totalUsers * SEED_CONFIG.USERS.ADMIN_PERCENTAGE
  );
  const moderatorCount = Math.floor(
    totalUsers * SEED_CONFIG.USERS.MODERATOR_PERCENTAGE
  );
  const regularUserCount = totalUsers - adminCount - moderatorCount;

  // Create admin users
  for (let i = 0; i < adminCount; i++) {
    const firstName = randomChoice(ZIMBABWE_DATA.NAMES.FIRST_NAMES);
    const lastName = randomChoice(ZIMBABWE_DATA.NAMES.LAST_NAMES);
    const user = await prisma.user.create({
      data: {
        email: `admin${i + 1}@nhandare.co.zw`,
        username: `${firstName}${lastName}${i + 1}`,
        password: await hash("admin123", 12),
        firstName: firstName,
        lastName: lastName,
        role: "super_admin",
        permissions: ["*"],
        isActive: true,
        isVerified: true,
        province: randomChoice(ZIMBABWE_DATA.PROVINCES),
        city: randomChoice(ZIMBABWE_DATA.CITIES.Harare),
        location: "Harare, Zimbabwe",
        phoneNumber: generateZimbabwePhone(),
        ecocashNumber: generateZimbabwePhone(),
        mobileMoneyProvider: "ECOCASH",
        preferredLanguage: "en",
        isStudent: false,
        institution: "Nhandare Gaming",
        points: 0,
        rank: i + 1,
        gamesPlayed: 0,
        gamesWon: 0,
        winRate: 0,
        dateOfBirth: randomDate(new Date(1980, 0, 1), new Date(1995, 0, 1)),
        gender: randomChoice(["male", "female"]),
        isVerifiedID: true,
      },
    });
    users.push(user);
  }

  // Create moderator users
  for (let i = 0; i < moderatorCount; i++) {
    const firstName = randomChoice(ZIMBABWE_DATA.NAMES.FIRST_NAMES);
    const lastName = randomChoice(ZIMBABWE_DATA.NAMES.LAST_NAMES);
    const user = await prisma.user.create({
      data: {
        email: `moderator${i + 1}@nhandare.co.zw`,
        username: `${firstName}${lastName}${i + 1}`,
        password: await hash("mod123", 12),
        firstName: firstName,
        lastName: lastName,
        role: "moderator",
        permissions: [
          "content:moderate",
          "user:moderate",
          "tournament:moderate",
        ],
        isActive: true,
        isVerified: true,
        province: randomChoice(ZIMBABWE_DATA.PROVINCES),
        city: randomChoice(ZIMBABWE_DATA.CITIES.Bulawayo),
        location: "Bulawayo, Zimbabwe",
        phoneNumber: generateZimbabwePhone(),
        ecocashNumber: generateZimbabwePhone(),
        mobileMoneyProvider: randomChoice(["ECOCASH", "ONEMONEY"]),
        preferredLanguage: randomChoice(["en", "sn", "nd"]),
        isStudent: false,
        institution: "Nhandare Gaming",
        points: randomInt(100, 500),
        rank: adminCount + i + 1,
        gamesPlayed: randomInt(10, 50),
        gamesWon: randomInt(5, 30),
        winRate: randomFloat(60, 85),
        dateOfBirth: randomDate(new Date(1985, 0, 1), new Date(2000, 0, 1)),
        gender: randomChoice(["male", "female"]),
        isVerifiedID: true,
      },
    });
    users.push(user);
  }

  // Create regular users
  for (let i = 0; i < regularUserCount; i++) {
    const isStudent = Math.random() < SEED_CONFIG.USERS.STUDENT_PERCENTAGE;
    const isVerified = Math.random() < SEED_CONFIG.USERS.VERIFIED_PERCENTAGE;
    const province = randomChoice(ZIMBABWE_DATA.PROVINCES);
    const city = randomChoice(
      ZIMBABWE_DATA.CITIES[province as keyof typeof ZIMBABWE_DATA.CITIES] ||
        ZIMBABWE_DATA.CITIES.Harare
    );
    const institution = isStudent
      ? randomChoice(institutions.filter((inst) => inst.type === "university"))
      : randomChoice(institutions.filter((inst) => inst.type === "company"));

    const gamesPlayed = randomInt(20, 200);
    const gamesWon = Math.floor(gamesPlayed * (randomFloat(50, 90) / 100));
    const winRate = (gamesWon / gamesPlayed) * 100;
    const points = Math.floor(winRate * 10) + randomInt(100, 500);

    const firstName = randomChoice(ZIMBABWE_DATA.NAMES.FIRST_NAMES);
    const lastName = randomChoice(ZIMBABWE_DATA.NAMES.LAST_NAMES);
    const user = await prisma.user.create({
      data: {
        email: `player${i + 1}@nhandare.co.zw`,
        username: `${firstName}${lastName}${i + 1}`,
        password: await hash("password123", 12),
        firstName: firstName,
        lastName: lastName,
        role: "user",
        permissions: [],
        isActive: true,
        isVerified,
        province,
        city,
        location: `${city}, ${province}`,
        phoneNumber: generateZimbabwePhone(),
        ecocashNumber: generateZimbabwePhone(),
        mobileMoneyProvider: randomChoice(["ECOCASH", "ONEMONEY", "TELECASH"]),
        preferredLanguage: randomChoice(["en", "sn", "nd"]),
        isStudent,
        institution: institution?.name || "Independent",
        points,
        rank: adminCount + moderatorCount + i + 1,
        gamesPlayed,
        gamesWon,
        winRate: parseFloat(winRate.toFixed(1)),
        dateOfBirth: randomDate(new Date(1990, 0, 1), new Date(2005, 0, 1)),
        gender: randomChoice(["male", "female"]),
        isVerifiedID: isVerified && Math.random() < 0.7,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=player${
          i + 1
        }`,
        bio: isStudent
          ? `Student at ${institution?.name}`
          : `Gaming enthusiast from ${province}`,
      },
    });
    users.push(user);
  }

  // Note: Game statistics are created in createGameStatistics function
  // to avoid duplicate creation and ensure proper data consistency

  return users;
}

async function createTournaments(games: any[], users: any[]) {
  const tournaments: any[] = [];
  const totalTournaments = SEED_CONFIG.TOURNAMENTS.TOTAL;
  const activeCount = Math.floor(
    totalTournaments * SEED_CONFIG.TOURNAMENTS.ACTIVE_PERCENTAGE
  );
  const completedCount = Math.floor(
    totalTournaments * SEED_CONFIG.TOURNAMENTS.COMPLETED_PERCENTAGE
  );
  const openCount = totalTournaments - activeCount - completedCount;

  // Ensure we create at least one tournament of each bracket type for testing
  const bracketTypes = [
    "SINGLE_ELIMINATION",
    "DOUBLE_ELIMINATION",
    "ROUND_ROBIN",
    "SWISS",
  ];

  console.log("🎯 Creating comprehensive bracket type coverage...");

  // Create one tournament of each bracket type for testing
  for (let i = 0; i < bracketTypes.length; i++) {
    const bracketType = bracketTypes[i];
    const playerCount = randomChoice(SEED_CONFIG.BRACKET_TESTING.PLAYER_COUNTS);
    const useAdvancedSeeding =
      Math.random() < SEED_CONFIG.TOURNAMENTS.ADVANCED_SEEDING_PERCENTAGE;

    const seedingConfig = useAdvancedSeeding
      ? {
          includePerformance: Math.random() < 0.8,
          includeHistory: Math.random() < 0.7,
          includeRegional: Math.random() < 0.6,
          includeConsistency: Math.random() < 0.5,
          performanceWeight:
            SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.PERFORMANCE,
          historyWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.HISTORY,
          regionalWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.REGIONAL,
          consistencyWeight:
            SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.CONSISTENCY,
          ratingWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.RATING,
          recentTournaments: randomInt(
            SEED_CONFIG.SEEDING.RECENT_TOURNAMENTS_RANGE[0],
            SEED_CONFIG.SEEDING.RECENT_TOURNAMENTS_RANGE[1]
          ),
          regionalRadius: randomInt(
            SEED_CONFIG.SEEDING.REGIONAL_RADIUS_RANGE[0],
            SEED_CONFIG.SEEDING.REGIONAL_RADIUS_RANGE[1]
          ),
        }
      : null;

    const tournament = await prisma.tournament.create({
      data: {
        title: `Test ${bracketType} Tournament - ${new Date().getFullYear()}`,
        description: `Comprehensive testing tournament for ${bracketType} bracket system with ${
          useAdvancedSeeding ? "advanced" : "basic"
        } seeding.`,
        prizePool: randomFloat(500, 2000),
        entryFee: randomFloat(20, 100),
        maxPlayers: playerCount,
        currentPlayers: Math.min(randomInt(8, playerCount), playerCount),
        status: "OPEN",
        province: randomChoice(ZIMBABWE_DATA.PROVINCES),
        city: randomChoice(ZIMBABWE_DATA.CITIES.Harare),
        location: "Harare, Zimbabwe",
        venue: randomChoice(SEED_CONFIG.CHESS.VENUES),
        isOnlineOnly: Math.random() < 0.7,
        targetAudience: randomChoice(["university", "corporate", "public"]),
        sponsorName: randomChoice([
          "Econet",
          "CBZ Bank",
          "Delta Corporation",
          "NetOne",
          null,
        ]),
        minimumAge: randomChoice([13, 16, 18, null]),
        maxAge: randomChoice([25, 35, 50, null]),
        category: randomChoice([
          "UNIVERSITY",
          "CORPORATE",
          "PUBLIC",
          "INVITATION_ONLY",
        ]),
        difficultyLevel: randomChoice(["beginner", "intermediate", "advanced"]),
        prizeBreakdown: {
          "1st": randomFloat(200, 1000),
          "2nd": randomFloat(100, 500),
          "3rd": randomFloat(50, 250),
          "4th": randomFloat(25, 100),
        },
        localCurrency: "USD",
        platformFeeRate: 0.2,
        registrationStart: new Date(),
        registrationEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        startDate: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 38 * 24 * 60 * 60 * 1000),
        gameId: games[0].id,
        bracketType: bracketType as any, // Cast to any to avoid type issues in seeding
        bracketConfig: {
          useAdvancedSeeding,
          seedingOptions: {
            includePerformance: useAdvancedSeeding,
            includeHistory: useAdvancedSeeding,
            includeRegional: useAdvancedSeeding && Math.random() < 0.4,
            includeConsistency: useAdvancedSeeding && Math.random() < 0.6,
            performanceWeight: useAdvancedSeeding
              ? SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.PERFORMANCE
              : 0,
            historyWeight: useAdvancedSeeding
              ? SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.HISTORY
              : 0,
            regionalWeight: useAdvancedSeeding
              ? SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.REGIONAL
              : 0,
            consistencyWeight: useAdvancedSeeding
              ? SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.CONSISTENCY
              : 0,
            ratingWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.RATING,
            recentTournaments: useAdvancedSeeding
              ? randomInt(
                  SEED_CONFIG.SEEDING.RECENT_TOURNAMENTS_RANGE[0],
                  SEED_CONFIG.SEEDING.RECENT_TOURNAMENTS_RANGE[1]
                )
              : 0,
            regionalRadius: useAdvancedSeeding
              ? randomInt(
                  SEED_CONFIG.SEEDING.REGIONAL_RADIUS_RANGE[0],
                  SEED_CONFIG.SEEDING.REGIONAL_RADIUS_RANGE[1]
                )
              : 0,
          },
        },
        bracket: {}, // Will be generated by BracketGenerationService
      },
    });

    console.log(`✅ Created ${bracketType} tournament: ${tournament.title}`);
    tournaments.push(tournament);
  }

  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, 0, 1);
  const oneYearFromNow = new Date(now.getFullYear() + 1, 11, 31);

  // Create completed tournaments
  for (let i = 0; i < completedCount; i++) {
    const game = randomChoice(games);
    const startDate = randomDate(
      oneYearAgo,
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    );
    const endDate = randomDate(
      startDate,
      new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    );
    const registrationStart = randomDate(
      new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000),
      startDate
    );
    const registrationEnd = randomDate(registrationStart, startDate);

    const tournament = await prisma.tournament.create({
      data: {
        title: `Chess Championship ${startDate.getFullYear()} - ${randomChoice([
          "Spring",
          "Summer",
          "Autumn",
          "Winter",
        ])}`,
        description: `Annual Chess championship tournament with exciting prizes and competitive gameplay. Test your strategic thinking against Zimbabwe's finest players.`,
        prizePool: randomFloat(100, 5000),
        entryFee: randomFloat(5, 50),
        maxPlayers: randomChoice([16, 32, 64, 128]),
        currentPlayers: randomInt(8, 64),
        status: "COMPLETED",
        province: randomChoice(ZIMBABWE_DATA.PROVINCES),
        city: randomChoice(ZIMBABWE_DATA.CITIES.Harare),
        location: "Harare, Zimbabwe",
        venue: randomChoice(SEED_CONFIG.CHESS.VENUES),
        isOnlineOnly: Math.random() < 0.6,
        targetAudience: randomChoice(["university", "corporate", "public"]),
        sponsorName: randomChoice([
          "Econet",
          "CBZ Bank",
          "Delta Corporation",
          "NetOne",
          null,
        ]),
        minimumAge: randomChoice([13, 16, 18, null]),
        maxAge: randomChoice([25, 35, 50, null]),
        category: randomChoice([
          "UNIVERSITY",
          "CORPORATE",
          "PUBLIC",
          "INVITATION_ONLY",
        ]),
        difficultyLevel: randomChoice(["beginner", "intermediate", "advanced"]),
        prizeBreakdown: {
          "1st": randomFloat(200, 2000),
          "2nd": randomFloat(100, 1000),
          "3rd": randomFloat(50, 500),
          "4th": randomFloat(25, 250),
          "5th": randomFloat(10, 100),
        },
        localCurrency: "USD",
        platformFeeRate: 0.2,
        registrationStart,
        registrationEnd,
        startDate,
        endDate,
        gameId: game.id,
        bracketType: randomChoice([
          "SINGLE_ELIMINATION",
          "DOUBLE_ELIMINATION",
          "ROUND_ROBIN",
          "SWISS",
        ]),
        bracket: {}, // Will be generated by BracketGenerationService
      },
    });
    tournaments.push(tournament);
  }

  // Create active tournaments
  for (let i = 0; i < activeCount; i++) {
    const game = randomChoice(games);
    const startDate = randomDate(
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      now
    );
    const endDate = randomDate(
      now,
      new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    );
    const registrationStart = randomDate(
      new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000),
      startDate
    );
    const registrationEnd = randomDate(registrationStart, startDate);

    const tournament = await prisma.tournament.create({
      data: {
        title: `Chess Live Tournament ${new Date().getFullYear()} - ${randomChoice(
          ["Weekend", "Midweek", "Holiday"]
        )}`,
        description: `Live Chess tournament happening now! Join the competition and win exciting prizes. Show your tactical brilliance!`,
        prizePool: randomFloat(200, 3000),
        entryFee: randomFloat(10, 100),
        maxPlayers: randomChoice([16, 32, 64]),
        currentPlayers: randomInt(8, 32),
        status: "ACTIVE",
        province: randomChoice(ZIMBABWE_DATA.PROVINCES),
        city: randomChoice(ZIMBABWE_DATA.CITIES.Bulawayo),
        location: "Bulawayo, Zimbabwe",
        venue: randomChoice(SEED_CONFIG.CHESS.VENUES),
        isOnlineOnly: Math.random() < 0.7,
        targetAudience: randomChoice(["university", "corporate", "public"]),
        sponsorName: randomChoice(["NetOne", "Econet", "CBZ Bank", null]),
        minimumAge: randomChoice([13, 16, 18, null]),
        maxAge: randomChoice([25, 35, 50, null]),
        category: randomChoice([
          "UNIVERSITY",
          "CORPORATE",
          "PUBLIC",
          "INVITATION_ONLY",
        ]),
        difficultyLevel: randomChoice(["beginner", "intermediate", "advanced"]),
        prizeBreakdown: {
          "1st": randomFloat(100, 1500),
          "2nd": randomFloat(50, 750),
          "3rd": randomFloat(25, 375),
          "4th": randomFloat(10, 150),
        },
        localCurrency: "USD",
        platformFeeRate: 0.2,
        registrationStart,
        registrationEnd,
        startDate,
        endDate,
        gameId: game.id,
        bracketType: randomChoice([
          "SINGLE_ELIMINATION",
          "DOUBLE_ELIMINATION",
          "ROUND_ROBIN",
          "SWISS",
        ]) as any,
        bracketConfig: {
          useAdvancedSeeding:
            Math.random() < SEED_CONFIG.TOURNAMENTS.ADVANCED_SEEDING_PERCENTAGE,
          seedingOptions: {
            includePerformance: true,
            includeHistory: true,
            includeRegional: Math.random() < 0.4,
            includeConsistency: Math.random() < 0.6,
            performanceWeight:
              SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.PERFORMANCE,
            historyWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.HISTORY,
            regionalWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.REGIONAL,
            consistencyWeight:
              SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.CONSISTENCY,
            ratingWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.RATING,
            recentTournaments: randomInt(
              SEED_CONFIG.SEEDING.RECENT_TOURNAMENTS_RANGE[0],
              SEED_CONFIG.SEEDING.RECENT_TOURNAMENTS_RANGE[1]
            ),
            regionalRadius: randomInt(
              SEED_CONFIG.SEEDING.REGIONAL_RADIUS_RANGE[0],
              SEED_CONFIG.SEEDING.REGIONAL_RADIUS_RANGE[1]
            ),
          },
        },
        bracket: {}, // Will be generated by BracketGenerationService
      },
    });
    tournaments.push(tournament);
  }

  // Create open tournaments
  for (let i = 0; i < openCount; i++) {
    const game = randomChoice(games);
    const registrationStart = randomDate(
      now,
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    );
    const registrationEnd = randomDate(
      registrationStart,
      new Date(registrationStart.getTime() + 30 * 24 * 60 * 60 * 1000)
    );
    const startDate = randomDate(
      registrationEnd,
      new Date(registrationEnd.getTime() + 7 * 24 * 60 * 60 * 1000)
    );
    const endDate = randomDate(
      startDate,
      new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    );

    const tournament = await prisma.tournament.create({
      data: {
        title: `Chess Open Championship ${new Date().getFullYear()} - ${randomChoice(
          ["Spring", "Summer", "Autumn", "Winter"]
        )}`,
        description: `Open Chess championship for all skill levels. Registration now open! Perfect for beginners and masters alike.`,
        prizePool: randomFloat(500, 10000),
        entryFee: randomFloat(20, 200),
        maxPlayers: randomChoice([32, 64, 128, 256]),
        currentPlayers: randomInt(0, 32),
        status: "OPEN",
        province: randomChoice(ZIMBABWE_DATA.PROVINCES),
        city: randomChoice(ZIMBABWE_DATA.CITIES.Manicaland),
        location: "Mutare, Zimbabwe",
        venue: randomChoice(SEED_CONFIG.CHESS.VENUES),
        isOnlineOnly: Math.random() < 0.5,
        targetAudience: randomChoice(["university", "corporate", "public"]),
        sponsorName: randomChoice([
          "Econet",
          "CBZ Bank",
          "Delta Corporation",
          "NetOne",
          null,
        ]),
        minimumAge: randomChoice([13, 16, 18, null]),
        maxAge: randomChoice([25, 35, 50, null]),
        category: randomChoice([
          "UNIVERSITY",
          "CORPORATE",
          "PUBLIC",
          "INVITATION_ONLY",
        ]),
        difficultyLevel: randomChoice(["beginner", "intermediate", "advanced"]),
        prizeBreakdown: {
          "1st": randomFloat(300, 3000),
          "2nd": randomFloat(150, 1500),
          "3rd": randomFloat(75, 750),
          "4th": randomFloat(40, 400),
          "5th": randomFloat(20, 200),
          "6th": randomFloat(10, 100),
        },
        localCurrency: "USD",
        platformFeeRate: 0.2,
        registrationStart,
        registrationEnd,
        startDate,
        endDate,
        gameId: game.id,
        bracketType: randomChoice([
          "SINGLE_ELIMINATION",
          "DOUBLE_ELIMINATION",
          "ROUND_ROBIN",
          "SWISS",
        ]) as any,
        bracketConfig: {
          useAdvancedSeeding:
            Math.random() < SEED_CONFIG.TOURNAMENTS.ADVANCED_SEEDING_PERCENTAGE,
          seedingOptions: {
            includePerformance: true,
            includeHistory: true,
            includeRegional: Math.random() < 0.4,
            includeConsistency: Math.random() < 0.6,
            performanceWeight:
              SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.PERFORMANCE,
            historyWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.HISTORY,
            regionalWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.REGIONAL,
            consistencyWeight:
              SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.CONSISTENCY,
            ratingWeight: SEED_CONFIG.SEEDING.PERFORMANCE_WEIGHTS.RATING,
            recentTournaments: randomInt(
              SEED_CONFIG.SEEDING.RECENT_TOURNAMENTS_RANGE[0],
              SEED_CONFIG.SEEDING.RECENT_TOURNAMENTS_RANGE[1]
            ),
            regionalRadius: randomInt(
              SEED_CONFIG.SEEDING.REGIONAL_RADIUS_RANGE[0],
              SEED_CONFIG.SEEDING.REGIONAL_RADIUS_RANGE[1]
            ),
          },
        },
        bracket: {}, // Will be generated by BracketGenerationService
      },
    });
    tournaments.push(tournament);
  }

  return tournaments;
}

// Bracket generation is now handled by BracketGenerationService.generateBracket()

async function createTournamentPlayers(tournaments: any[], users: any[]) {
  const tournamentPlayers: any[] = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const playerCount = Math.min(
      tournament.currentPlayers,
      regularUsers.length
    );
    const selectedUsers = regularUsers.slice(0, playerCount);

    for (let i = 0; i < selectedUsers.length; i++) {
      const user = selectedUsers[i];
      const isEliminated =
        tournament.status === "COMPLETED" && Math.random() < 0.7;
      const placement =
        tournament.status === "COMPLETED" && !isEliminated
          ? randomInt(1, Math.min(10, playerCount))
          : null;
      const prizeWon =
        placement && placement <= 6
          ? (tournament.prizeBreakdown as any)[placement.toString()] || 0
          : 0;

      const tournamentPlayer = await prisma.tournamentPlayer.create({
        data: {
          userId: user.id,
          tournamentId: tournament.id,
          registeredAt: randomDate(
            tournament.registrationStart,
            tournament.registrationEnd
          ),
          joinedAt: randomDate(
            tournament.registrationStart,
            tournament.registrationEnd
          ),
          isActive: true,
          seedNumber: i + 1,
          currentRound:
            tournament.status === "ACTIVE"
              ? randomInt(1, 3)
              : tournament.status === "COMPLETED"
              ? 6
              : 1,
          isEliminated,
          placement,
          prizeWon,
        },
      });
      tournamentPlayers.push(tournamentPlayer);
    }
  }

  return tournamentPlayers;
}

async function createMatches(tournaments: any[], users: any[]) {
  const matches = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
      include: { user: true },
    });

    if (players.length >= 2) {
      const matchCount = Math.min(
        SEED_CONFIG.MATCHES.PER_TOURNAMENT,
        Math.floor(players.length / 2)
      );

      for (let i = 0; i < matchCount; i++) {
        const player1 = players[i * 2];
        const player2 = players[i * 2 + 1];

        if (player1 && player2) {
          const isCompleted =
            Math.random() < SEED_CONFIG.MATCHES.COMPLETED_PERCENTAGE;
          const result = isCompleted
            ? randomChoice(["PLAYER1_WIN", "PLAYER2_WIN", "DRAW"])
            : "PENDING";
          const winnerId =
            result === "PLAYER1_WIN"
              ? player1.userId
              : result === "PLAYER2_WIN"
              ? player2.userId
              : null;

          const match = await prisma.match.create({
            data: {
              player1Id: player1.userId,
              player2Id: player2.userId,
              gameId: tournament.gameId,
              tournamentId: tournament.id,
              round: randomInt(1, 6),
              status: isCompleted
                ? "COMPLETED"
                : randomChoice(["PENDING", "ACTIVE"]),
              result: result as any,
              winnerId,
              gameData: {
                moves: generateGameMoves(tournament.gameId),
                finalPosition: generateFinalPosition(tournament.gameId),
                timeControl: randomChoice(SEED_CONFIG.CHESS.TIME_CONTROLS),
                opening: randomChoice(SEED_CONFIG.CHESS.OPENINGS),
              },
              duration: randomInt(300, 3600), // 5 minutes to 1 hour
              createdAt: randomDate(
                tournament.startDate,
                tournament.endDate || new Date()
              ),
              startedAt: isCompleted
                ? randomDate(
                    tournament.startDate,
                    tournament.endDate || new Date()
                  )
                : null,
              finishedAt: isCompleted
                ? randomDate(
                    tournament.startDate,
                    tournament.endDate || new Date()
                  )
                : null,
            },
          });
          matches.push(match);
        }
      }
    }
  }

  return matches;
}

function generateGameMoves(gameId: string): string[] {
  const moveCount = randomInt(10, 50);
  const moves = [];

  // Chess-specific moves with common openings and tactics
  const chessMoves = [
    // Common opening moves
    "e4",
    "e5",
    "Nf3",
    "Nc6",
    "Bb5",
    "a6",
    "Ba4",
    "Nf6",
    "O-O",
    "d4",
    "exd4",
    "Nxd4",
    "Nf6",
    "e5",
    "Ne4",
    "d6",
    "Nf3",
    "Nc6",
    "Bc4",
    "Be7",
    "O-O",
    "O-O",
    "Re1",
    "b5",
    // Middle game moves
    "Nxe5",
    "Nxe5",
    "Qd5",
    "Qd5",
    "Nxf7",
    "Kxf7",
    "Qxd5",
    "Nxd5",
    "Bxf7",
    "Kxf7",
    "Qd5",
    "Qd5",
    "Nxe5",
    "Nxe5",
    "Qd5",
    "Qd5",
    "Nxf7",
    "Kxf7",
    "Qxd5",
    "Nxd5",
    // Endgame moves
    "Kf1",
    "Kf8",
    "Ke2",
    "Ke7",
    "Kd3",
    "Kd6",
    "Kc4",
    "Kc5",
    "Kb5",
    "Kb4",
    "Ka6",
    "Ka3",
  ];

  for (let i = 0; i < moveCount; i++) {
    moves.push(randomChoice(chessMoves));
  }

  return moves;
}

function generateFinalPosition(gameId: string): string {
  // Chess-specific final positions representing common endgame scenarios
  const chessPositions = [
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR", // Starting position
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR", // After e4
    "rnbqkbnr/pppp1ppp/2p5/4p3/4P3/8/PPPP1PPP/RNBQKBNR", // After e4 e5
    "rnbqkbnr/pppp1ppp/2p5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R", // After e4 e5 Nf3
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R", // After e4 e5 Nf3 Nc6
    "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R", // After e4 e5 Nf3 Nc6 Bb5
    "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R", // After e4 e5 Nf3 Nc6 Bb5 a6
  ];

  return randomChoice(chessPositions);
}

async function createGameSessions(matches: any[], users: any[], games: any[]) {
  const gameSessions = [];

  for (const match of matches) {
    if (match.status === "COMPLETED") {
      const session = await prisma.gameSession.create({
        data: {
          userId: match.player1Id,
          gameId: match.gameId,
          sessionType: "TOURNAMENT",
          opponentId: match.player2Id,
          isActive: false,
          gameState: match.gameData,
          moves: [match.gameData.moves],
          result: match.result,
          score:
            match.result === "PLAYER1_WIN"
              ? 1
              : match.result === "PLAYER2_WIN"
              ? 0
              : 0.5,
          duration: match.duration,
          matchId: match.id,
          createdAt: match.createdAt,
          startedAt: match.startedAt,
          finishedAt: match.finishedAt,
        },
      });
      gameSessions.push(session);

      // Create session for player 2
      const session2 = await prisma.gameSession.create({
        data: {
          userId: match.player2Id,
          gameId: match.gameId,
          sessionType: "TOURNAMENT",
          opponentId: match.player1Id,
          isActive: false,
          gameState: match.gameData,
          moves: [match.gameData.moves],
          result:
            match.result === "PLAYER1_WIN"
              ? "PLAYER2_WIN"
              : match.result === "PLAYER2_WIN"
              ? "PLAYER1_WIN"
              : "DRAW",
          score:
            match.result === "PLAYER2_WIN"
              ? 1
              : match.result === "PLAYER1_WIN"
              ? 0
              : 0.5,
          duration: match.duration,
          matchId: match.id,
          createdAt: match.createdAt,
          startedAt: match.startedAt,
          finishedAt: match.finishedAt,
        },
      });
      gameSessions.push(session2);
    }
  }

  return gameSessions;
}

async function createGameStatistics(users: any[], games: any[]) {
  const gameStatistics = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const user of regularUsers) {
    // Create statistics for Chess only
    const game = games[0]; // Chess game
    const gamesPlayed = randomInt(20, 100);
    const gamesWon = Math.floor(gamesPlayed * (user.winRate / 100));
    const gamesLost = gamesPlayed - gamesWon;
    const gamesDrawn = Math.floor(Math.random() * 5);
    const totalPlayTime = gamesPlayed * (game.averageTimeMs / 1000);
    const currentRating = user.points + randomInt(-100, 100);
    const peakRating = currentRating + randomInt(0, 200);

    const stat = await prisma.gameStatistic.create({
      data: {
        userId: user.id,
        gameId: game.id,
        gamesPlayed,
        gamesWon,
        gamesLost,
        gamesDrawn,
        winRate: parseFloat(((gamesWon / gamesPlayed) * 100).toFixed(1)),
        averageScore: parseFloat((gamesWon * 3 + gamesDrawn * 1).toFixed(1)),
        bestScore: gamesWon * 3,
        totalPlayTime: Math.floor(totalPlayTime),
        currentRating,
        peakRating,
      },
    });
    gameStatistics.push(stat);
  }

  return gameStatistics;
}

async function createAchievements() {
  const achievementsData = [
    {
      name: "First Victory",
      description: "Win your first game",
      icon: "🏆",
      type: "GAMES_WON" as const,
      requirements: { gamesWon: 1 },
      points: 10,
    },
    {
      name: "Victory Streak",
      description: "Win 5 games in a row",
      icon: "🔥",
      type: "WIN_STREAK" as const,
      requirements: { winStreak: 5 },
      points: 50,
    },
    {
      name: "Tournament Champion",
      description: "Win a tournament",
      icon: "👑",
      type: "TOURNAMENTS_WON" as const,
      requirements: { tournamentsWon: 1 },
      points: 100,
    },
    {
      name: "Rating Master",
      description: "Reach a rating of 2000",
      icon: "⭐",
      type: "RATING_MILESTONE" as const,
      requirements: { rating: 2000 },
      points: 200,
    },
    {
      name: "Dedicated Player",
      description: "Play 100 games",
      icon: "🎮",
      type: "PARTICIPATION" as const,
      requirements: { gamesPlayed: 100 },
      points: 75,
    },
    {
      name: "Chess Grandmaster",
      description: "Achieve grandmaster status in chess",
      icon: "♟️",
      type: "SPECIAL" as const,
      requirements: { chessRating: 2500, gamesWon: 100 },
      points: 500,
    },
  ];

  const achievements = [];
  for (const achievementData of achievementsData) {
    const achievement = await prisma.achievement.create({
      data: achievementData,
    });
    achievements.push(achievement);
  }
  return achievements;
}

async function createUserAchievements(users: any[], achievements: any[]) {
  const userAchievements = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const user of regularUsers) {
    const userAchievementCount = randomInt(1, 4);
    const selectedAchievements = achievements.slice(0, userAchievementCount);

    for (const achievement of selectedAchievements) {
      const userAchievement = await prisma.userAchievement.create({
        data: {
          userId: user.id,
          achievementId: achievement.id,
          unlockedAt: randomDate(
            new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
            new Date()
          ),
        },
      });
      userAchievements.push(userAchievement);
    }
  }

  return userAchievements;
}

async function createPayments(users: any[], tournaments: any[]) {
  const payments = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
      include: { user: true },
    });

    // Create entry fee payments
    for (const player of players) {
      const isSuccessful = Math.random() < SEED_CONFIG.PAYMENTS.SUCCESS_RATE;
      const status = isSuccessful
        ? "COMPLETED"
        : randomChoice(["FAILED", "PENDING", "CANCELLED"]);
      const failureReason = !isSuccessful
        ? randomChoice(SEED_CONFIG.PAYMENTS.FAILURE_REASONS)
        : null;

      const payment = await prisma.payment.create({
        data: {
          userId: player.userId,
          tournamentId: tournament.id,
          amount: tournament.entryFee,
          currency: tournament.localCurrency,
          type: "ENTRY_FEE",
          status: status as any,
          pesePayTransactionId: isSuccessful
            ? `pese_${Date.now()}_${player.userId}`
            : null,
          pesePayReference: `ref_${tournament.id}_${player.userId}`,
          paymentMethodCode: randomChoice(["ECOCASH", "ONEMONEY", "TELECASH"]),
          mobileMoneyNumber: player.user.ecocashNumber,
          paymentInitiatedAt: randomDate(
            tournament.registrationStart,
            tournament.registrationEnd
          ),
          paymentConfirmedAt: isSuccessful
            ? randomDate(
                tournament.registrationStart,
                tournament.registrationEnd
              )
            : null,
          paymentFailedAt: !isSuccessful
            ? randomDate(
                tournament.registrationStart,
                tournament.registrationEnd
              )
            : null,
          failureReason,
          exchangeRate: 1.0,
          localAmount: tournament.entryFee,
          localCurrency: tournament.localCurrency,
          metadata: {
            tournamentTitle: tournament.title,
            playerUsername: player.user.username,
            paymentMethod: "Mobile Money",
          },
        },
      });
      payments.push(payment);
    }

    // Create prize payments for completed tournaments
    if (tournament.status === "COMPLETED") {
      const prizeBreakdown = tournament.prizeBreakdown as any;
      for (
        let i = 0;
        i < Math.min(players.length, Object.keys(prizeBreakdown).length);
        i++
      ) {
        const placement = i + 1;
        const prizeKey = Object.keys(prizeBreakdown)[i];
        const prizeAmount = prizeBreakdown[prizeKey];

        if (prizeAmount > 0) {
          const payment = await prisma.payment.create({
            data: {
              userId: players[i].userId,
              tournamentId: tournament.id,
              amount: prizeAmount,
              currency: tournament.localCurrency,
              type: "PRIZE_PAYOUT",
              status: "COMPLETED",
              pesePayTransactionId: `pese_prize_${Date.now()}_${
                players[i].userId
              }`,
              pesePayReference: `ref_prize_${tournament.id}_${players[i].userId}`,
              paymentMethodCode: "ECOCASH",
              mobileMoneyNumber: players[i].user.ecocashNumber,
              paymentInitiatedAt: randomDate(
                tournament.endDate || new Date(),
                new Date()
              ),
              paymentConfirmedAt: randomDate(
                tournament.endDate || new Date(),
                new Date()
              ),
              exchangeRate: 1.0,
              localAmount: prizeAmount,
              localCurrency: tournament.localCurrency,
              metadata: {
                tournamentTitle: tournament.title,
                placement,
                prizeType: prizeKey,
              },
            },
          });
          payments.push(payment);
        }
      }
    }
  }

  return payments;
}

async function createMatchmakingQueue(users: any[], games: any[]) {
  const matchmakingQueue = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const user of regularUsers) {
    if (Math.random() < 0.3) {
      // 30% of users are in queue
      const queueEntry = await prisma.matchmakingQueue.create({
        data: {
          userId: user.id,
          gameType: "Chess",
          rating: user.points,
          status: randomChoice(["waiting", "matched", "cancelled"]),
        },
      });
      matchmakingQueue.push(queueEntry);
    }
  }

  return matchmakingQueue;
}

async function createMatchmakingMetrics(games: any[]) {
  const matchmakingMetrics = [];

  // Create metrics for Chess only
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    // Last 30 days
    const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);

    const metrics = await prisma.matchmakingMetrics.create({
      data: {
        gameType: "Chess",
        date,
        averageWaitTime: randomInt(15, 120), // 15 seconds to 2 minutes
        totalMatches: randomInt(50, 500),
        aiMatches: randomInt(10, 100),
        humanMatches: randomInt(40, 400),
        averageRatingDifference: randomInt(50, 200),
        peakConcurrentUsers: randomInt(100, 1000),
      },
    });
    matchmakingMetrics.push(metrics);
  }

  return matchmakingMetrics;
}

async function createTournamentEvents(tournaments: any[], users: any[]) {
  const tournamentEvents = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
    });

    // Create player joined events
    for (const player of players.slice(0, 5)) {
      const event = await prisma.tournamentEvent.create({
        data: {
          tournamentId: tournament.id,
          userId: player.userId,
          type: "player_joined",
          message: "joined the tournament",
          metadata: {
            playerName: users.find((u) => u.id === player.userId)?.username,
            timestamp: player.joinedAt,
          },
        },
      });
      tournamentEvents.push(event);
    }

    // Create match result events
    const matches = await prisma.match.findMany({
      where: { tournamentId: tournament.id },
    });

    for (const match of matches.slice(0, 3)) {
      const winner =
        match.result === "PLAYER1_WIN" ? match.player1Id : match.player2Id;
      const loser =
        match.result === "PLAYER1_WIN" ? match.player2Id : match.player1Id;

      const event = await prisma.tournamentEvent.create({
        data: {
          tournamentId: tournament.id,
          userId: winner,
          type: "match_result",
          message: "defeated",
          metadata: {
            opponent: users.find((u) => u.id === loser)?.username,
            score: "1-0",
            matchId: match.id,
          },
        },
      });
      tournamentEvents.push(event);
    }
  }

  return tournamentEvents;
}

async function createTournamentHighlights(tournaments: any[], users: any[]) {
  const tournamentHighlights = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
    });

    for (let i = 0; i < Math.min(players.length, 3); i++) {
      const player = players[i];
      const achievements = [
        "Perfect Game",
        "Comeback Victory",
        "Quick Win",
        "Strategic Masterpiece",
        "Endgame Excellence",
      ];

      const highlight = await prisma.tournamentHighlight.create({
        data: {
          tournamentId: tournament.id,
          userId: player.userId,
          achievement: achievements[i % achievements.length],
          description: `${achievements[i % achievements.length]} in Round ${
            i + 1
          }`,
        },
      });
      tournamentHighlights.push(highlight);
    }
  }

  return tournamentHighlights;
}

async function createTournamentSpectators(tournaments: any[], users: any[]) {
  const tournamentSpectators = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const playerCount = tournament.currentPlayers;
    const spectatorCount = Math.floor(playerCount * 0.3); // 30% of players are spectators

    for (let i = 0; i < spectatorCount; i++) {
      const user = regularUsers[i % regularUsers.length];
      const spectator = await prisma.tournamentSpectator.create({
        data: {
          tournamentId: tournament.id,
          userId: user.id,
          joinedAt: randomDate(
            tournament.startDate,
            tournament.endDate || new Date()
          ),
          leftAt:
            Math.random() < 0.7
              ? randomDate(
                  tournament.startDate,
                  tournament.endDate || new Date()
                )
              : null,
          isActive: Math.random() < 0.8,
        },
      });
      tournamentSpectators.push(spectator);
    }
  }

  return tournamentSpectators;
}

async function createUserActivities(users: any[]) {
  const userActivities = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (const user of regularUsers) {
    // Login activities
    for (let i = 0; i < 5; i++) {
      const activity = await prisma.userActivity.create({
        data: {
          userId: user.id,
          activityType: "login",
          description: "User logged in",
          ipAddress: `192.168.1.${randomInt(1, 255)}`,
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          metadata: {
            location: user.location,
            device: randomChoice(["desktop", "mobile", "tablet"]),
          },
        },
      });
      userActivities.push(activity);
    }

    // Game activities
    for (let i = 0; i < 3; i++) {
      const activity = await prisma.userActivity.create({
        data: {
          userId: user.id,
          activityType: "game_played",
          description: "Played game against opponent",
          ipAddress: `192.168.1.${randomInt(1, 255)}`,
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          metadata: {
            gameType: "chess",
            result: randomChoice(["win", "loss", "draw"]),
            opponent:
              regularUsers[randomInt(0, regularUsers.length - 1)].username,
          },
        },
      });
      userActivities.push(activity);
    }
  }

  return userActivities;
}

async function createFlaggedContent(users: any[]) {
  const flaggedContent = [];
  const regularUsers = users.filter((u) => u.role === "user");
  const adminUsers = users.filter(
    (u) => u.role === "admin" || u.role === "moderator"
  );

  const flaggedContentData = [
    {
      contentType: "message",
      contentId: "msg_123",
      reporterId: regularUsers[0].id,
      reason: "inappropriate_content",
      severity: "medium",
      status: "pending",
    },
    {
      contentType: "profile",
      contentId: "profile_456",
      reporterId: regularUsers[1].id,
      reason: "spam",
      severity: "low",
      status: "reviewed",
      moderatorId: adminUsers[0]?.id,
      reviewedAt: new Date(),
      notes: "Profile contains excessive promotional content",
    },
  ];

  for (const contentData of flaggedContentData) {
    const content = await prisma.flaggedContent.create({ data: contentData });
    flaggedContent.push(content);
  }

  return flaggedContent;
}

async function createUserModerations(users: any[]) {
  const userModerations = [];
  const regularUsers = users.filter((u) => u.role === "user");
  const adminUsers = users.filter(
    (u) => u.role === "admin" || u.role === "moderator"
  );

  for (let i = 0; i < 3; i++) {
    const moderation = await prisma.userModeration.create({
      data: {
        userId: regularUsers[i].id,
        moderatorId: adminUsers[0]?.id || regularUsers[0].id,
        action: randomChoice(["warn", "suspend", "ban"]),
        reason: randomChoice([
          "Minor rule violation",
          "Repeated violations",
          "Inappropriate behavior",
        ]),
        duration: randomChoice([null, 7, 14, 30]),
        expiresAt: randomChoice([
          null,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ]),
        isActive: Math.random() < 0.8,
        notes: "Moderation action taken",
      },
    });
    userModerations.push(moderation);
  }

  return userModerations;
}

async function createAuditLogs(users: any[]) {
  const auditLogs = [];
  const adminUsers = users.filter(
    (u) => u.role === "admin" || u.role === "moderator"
  );

  for (let i = 0; i < 10; i++) {
    const auditLog = await prisma.auditLog.create({
      data: {
        userId: adminUsers[0]?.id || users[0].id,
        targetType: randomChoice(["user", "tournament", "payment", "match"]),
        targetId: `target_${i}`,
        action: randomChoice([
          "created",
          "updated",
          "deleted",
          "status_changed",
        ]),
        previousValue: { status: "active" },
        newValue: { status: "inactive" },
        reason: "Administrative action",
        ipAddress: `192.168.1.${randomInt(100, 200)}`,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    auditLogs.push(auditLog);
  }

  return auditLogs;
}

async function createChallengeInvitations(users: any[], games: any[]) {
  const challengeInvitations = [];
  const regularUsers = users.filter((u) => u.role === "user");

  for (let i = 0; i < 20; i++) {
    const challenger = regularUsers[randomInt(0, regularUsers.length - 1)];
    const challenged = regularUsers[randomInt(0, regularUsers.length - 1)];

    if (challenger.id !== challenged.id) {
      const challenge = await prisma.challengeInvitation.create({
        data: {
          challengerId: challenger.id,
          challengedId: challenged.id,
          gameId: games[0].id, // Chess game
          status: randomChoice(["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"]),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        },
      });
      challengeInvitations.push(challenge);
    }
  }

  return challengeInvitations;
}

// Execute the seeder
main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
