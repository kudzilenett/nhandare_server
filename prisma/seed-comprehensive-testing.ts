import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

// Comprehensive testing configuration for bracket system
const COMPREHENSIVE_TEST_CONFIG = {
  USERS: {
    TOTAL: 150, // More users for extensive testing
    ADMIN_PERCENTAGE: 0.05,
    MODERATOR_PERCENTAGE: 0.1,
    VERIFIED_PERCENTAGE: 0.85,
  },
  TOURNAMENTS: {
    // Comprehensive bracket type testing
    BRACKET_TESTING: {
      // Test each bracket type with multiple player counts
      SINGLE_ELIMINATION: {
        PLAYER_COUNTS: [3, 4, 5, 8, 9, 15, 16, 17, 31, 32, 33, 63, 64, 65], // Edge cases + powers of 2
        COUNT: 15, // Multiple tournaments per bracket type
      },
      DOUBLE_ELIMINATION: {
        PLAYER_COUNTS: [3, 4, 5, 8, 9, 15, 16, 17, 31, 32], // Smaller due to complexity
        COUNT: 10,
      },
      ROUND_ROBIN: {
        PLAYER_COUNTS: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // Good for round robin
        COUNT: 12,
      },
      SWISS: {
        PLAYER_COUNTS: [8, 9, 15, 16, 17, 31, 32, 33, 63, 64], // Swiss works well with larger groups
        COUNT: 10,
      },
    },
    // Advanced seeding testing combinations
    SEEDING_COMBINATIONS: [
      // Test all possible combinations of seeding factors
      {
        name: "Rating Only",
        includePerformance: false,
        includeHistory: false,
        includeRegional: false,
        includeConsistency: false,
        ratingWeight: 1.0,
      },
      {
        name: "Rating + Performance",
        includePerformance: true,
        includeHistory: false,
        includeRegional: false,
        includeConsistency: false,
        ratingWeight: 0.7,
        performanceWeight: 0.3,
      },
      {
        name: "Rating + History",
        includePerformance: false,
        includeHistory: true,
        includeRegional: false,
        includeConsistency: false,
        ratingWeight: 0.75,
        historyWeight: 0.25,
      },
      {
        name: "Rating + Regional",
        includePerformance: false,
        includeHistory: false,
        includeRegional: true,
        includeConsistency: false,
        ratingWeight: 0.85,
        regionalWeight: 0.15,
      },
      {
        name: "Rating + Consistency",
        includePerformance: false,
        includeHistory: false,
        includeRegional: false,
        includeConsistency: true,
        ratingWeight: 0.9,
        consistencyWeight: 0.1,
      },
      {
        name: "Performance + History",
        includePerformance: true,
        includeHistory: true,
        includeRegional: false,
        includeConsistency: false,
        ratingWeight: 0.5,
        performanceWeight: 0.3,
        historyWeight: 0.2,
      },
      {
        name: "All Factors Balanced",
        includePerformance: true,
        includeHistory: true,
        includeRegional: true,
        includeConsistency: true,
        ratingWeight: 0.4,
        performanceWeight: 0.25,
        historyWeight: 0.2,
        regionalWeight: 0.1,
        consistencyWeight: 0.05,
      },
      {
        name: "Performance Heavy",
        includePerformance: true,
        includeHistory: true,
        includeRegional: false,
        includeConsistency: true,
        ratingWeight: 0.3,
        performanceWeight: 0.45,
        historyWeight: 0.15,
        consistencyWeight: 0.1,
      },
      {
        name: "History Heavy",
        includePerformance: true,
        includeHistory: true,
        includeRegional: true,
        includeConsistency: false,
        ratingWeight: 0.3,
        performanceWeight: 0.2,
        historyWeight: 0.4,
        regionalWeight: 0.1,
      },
      {
        name: "Regional Focus",
        includePerformance: true,
        includeHistory: false,
        includeRegional: true,
        includeConsistency: true,
        ratingWeight: 0.4,
        performanceWeight: 0.2,
        regionalWeight: 0.25,
        consistencyWeight: 0.15,
      },
    ],
    // Tournament status distribution for comprehensive testing
    STATUS_DISTRIBUTION: {
      OPEN: 0.3, // 30% open for testing registration and bracket generation
      ACTIVE: 0.25, // 25% active for testing live tournament features
      COMPLETED: 0.35, // 35% completed for testing results and analytics
      CANCELLED: 0.1, // 10% cancelled for testing edge cases
    },
  },
  // Comprehensive match testing
  MATCHES: {
    STATUS_DISTRIBUTION: {
      COMPLETED: 0.6, // 60% completed matches
      ACTIVE: 0.15, // 15% active matches
      PENDING: 0.2, // 20% pending matches
      CANCELLED: 0.05, // 5% cancelled matches
    },
  },
  // Payment testing scenarios
  PAYMENTS: {
    SUCCESS_RATE: 0.9, // 90% success for realistic testing
    FAILURE_SCENARIOS: [
      "insufficient_funds",
      "network_timeout",
      "invalid_mobile_number",
      "provider_service_unavailable",
      "daily_limit_exceeded",
      "card_declined",
      "system_error",
    ],
  },
};

// Extended Zimbabwe data for comprehensive testing
const EXTENDED_ZIMBABWE_DATA = {
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
  CITIES: {
    Harare: ["Harare", "Chitungwiza", "Epworth", "Ruwa"],
    Bulawayo: ["Bulawayo", "Pumula", "Entumbane"],
    Manicaland: ["Mutare", "Rusape", "Chipinge", "Nyanga"],
    "Mashonaland Central": ["Bindura", "Shamva", "Mazowe"],
    "Mashonaland East": ["Marondera", "Wedza", "Mudzi"],
    "Mashonaland West": ["Chinhoyi", "Kariba", "Kadoma"],
    Masvingo: ["Masvingo", "Chiredzi", "Bikita"],
    "Matabeleland North": ["Victoria Falls", "Hwange", "Binga"],
    "Matabeleland South": ["Gwanda", "Beitbridge", "Plumtree"],
    Midlands: ["Gweru", "Kwekwe", "Shurugwi", "Redcliff"],
  },
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
      "Farai",
      "Fadzai",
      "Fungai",
      "Chiedza",
      "Munashe",
      "Munyaradzi",
      "Nyasha",
      "Takudzwa",
      "Tsitsi",
      "Tavonga",
      "Tumai",
      "Tinotenda",
      "Tichafa",
      // Ndebele names
      "Sipho",
      "Thabo",
      "Nkosana",
      "Mandla",
      "Siphiwe",
      "Nomsa",
      "Thandiwe",
      "Sibusiso",
      "Nkululeko",
      "Nomthandazo",
      "Sithembile",
      "Mthunzi",
      "Nompumelelo",
      "Sizani",
      "Thokozani",
      // English names common in Zimbabwe
      "Michael",
      "David",
      "Peter",
      "John",
      "James",
      "Robert",
      "William",
      "Mary",
      "Elizabeth",
      "Sarah",
      "Grace",
      "Faith",
      "Hope",
      "Joy",
    ],
    LAST_NAMES: [
      // Shona surnames
      "Moyo",
      "Ncube",
      "Dube",
      "Sibanda",
      "Mpofu",
      "Nyoni",
      "Ndlovu",
      "Maphosa",
      "Mukamuri",
      "Chigumbura",
      "Mazorodze",
      "Chikwanha",
      "Mutasa",
      "Mujuru",
      "Zivhu",
      "Gumbo",
      "Marume",
      "Chivasa",
      "Mukamuri",
      "Chidzonga",
      "Mutendi",
      "Mushonga",
      "Chitauro",
      "Maziwisa",
      "Mapfumo",
      "Chitepo",
      "Mutasa",
      "Chigwedere",
      // Ndebele surnames
      "Nkomo",
      "Msipa",
      "Tshuma",
      "Mthembu",
      "Khumalo",
      "Sibanda",
      "Tshuma",
      "Lunga",
      "Nkala",
      "Mhlanga",
      "Nyathi",
      "Gumede",
    ],
  },
  INSTITUTIONS: [
    // Universities
    { name: "University of Zimbabwe", type: "university", province: "Harare" },
    {
      name: "Midlands State University",
      type: "university",
      province: "Midlands",
    },
    {
      name: "National University of Science and Technology",
      type: "university",
      province: "Bulawayo",
    },
    { name: "Africa University", type: "university", province: "Manicaland" },
    {
      name: "Bindura University of Science Education",
      type: "university",
      province: "Mashonaland Central",
    },
    {
      name: "Chinhoyi University of Technology",
      type: "university",
      province: "Mashonaland West",
    },
    {
      name: "Great Zimbabwe University",
      type: "university",
      province: "Masvingo",
    },
    {
      name: "Lupane State University",
      type: "university",
      province: "Matabeleland North",
    },
    {
      name: "Manicaland State University of Applied Sciences",
      type: "university",
      province: "Manicaland",
    },
    {
      name: "Zimbabwe Open University",
      type: "university",
      province: "Harare",
    },

    // Polytechnics and Colleges
    { name: "Harare Polytechnic", type: "polytechnic", province: "Harare" },
    { name: "Bulawayo Polytechnic", type: "polytechnic", province: "Bulawayo" },
    { name: "Gweru Polytechnic", type: "polytechnic", province: "Midlands" },
    { name: "Mutare Polytechnic", type: "polytechnic", province: "Manicaland" },

    // High Schools
    { name: "Prince Edward School", type: "high_school", province: "Harare" },
    { name: "St. George's College", type: "high_school", province: "Harare" },
    { name: "Milton High School", type: "high_school", province: "Bulawayo" },
    {
      name: "Plumtree School",
      type: "high_school",
      province: "Matabeleland South",
    },
    {
      name: "Falcon College",
      type: "high_school",
      province: "Matabeleland South",
    },
    {
      name: "St. Augustine's Mission",
      type: "high_school",
      province: "Manicaland",
    },
  ],
};

// Utility functions
function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function generateZimbabwePhone(): string {
  const prefixes = ["077", "078", "071", "073", "076"];
  const prefix = randomChoice(prefixes);
  const number = Math.floor(Math.random() * 10000000)
    .toString()
    .padStart(7, "0");
  return `+263${prefix.slice(1)}${number}`;
}

// Clear existing data
async function clearExistingData() {
  const deletePromises = [
    prisma.challengeInvitation.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.userModeration.deleteMany({}),
    prisma.flaggedContent.deleteMany({}),
    prisma.userActivity.deleteMany({}),
    prisma.tournamentSpectator.deleteMany({}),
    prisma.tournamentHighlight.deleteMany({}),
    prisma.tournamentEvent.deleteMany({}),
    prisma.matchmakingMetrics.deleteMany({}),
    prisma.matchmakingQueue.deleteMany({}),
    prisma.payment.deleteMany({}),
    prisma.userAchievement.deleteMany({}),
    prisma.achievement.deleteMany({}),
    prisma.gameStatistics.deleteMany({}),
    prisma.gameSession.deleteMany({}),
    prisma.match.deleteMany({}),
    prisma.tournamentPlayer.deleteMany({}),
    prisma.tournament.deleteMany({}),
    prisma.mobileMoneyProvider.deleteMany({}),
    prisma.institution.deleteMany({}),
    prisma.game.deleteMany({}),
    prisma.user.deleteMany({}),
  ];

  await Promise.all(deletePromises);
}

// Create games
async function createGames() {
  const games = [];

  // Chess - Primary game for testing
  const chess = await prisma.game.create({
    data: {
      name: "Chess",
      description: "Strategic board game played between two players",
      category: "STRATEGY",
      minPlayers: 2,
      maxPlayers: 2,
      averageGameTime: 30,
      isActive: true,
      rules: "Standard chess rules apply",
      instructions: "Move pieces to checkmate opponent's king",
      difficultyLevel: "intermediate",
    },
  });
  games.push(chess);

  // Additional games for variety
  const checkers = await prisma.game.create({
    data: {
      name: "Checkers",
      description: "Classic board game with jumping captures",
      category: "STRATEGY",
      minPlayers: 2,
      maxPlayers: 2,
      averageGameTime: 20,
      isActive: true,
      rules: "Standard checkers rules",
      instructions: "Capture all opponent pieces or block their moves",
      difficultyLevel: "beginner",
    },
  });
  games.push(checkers);

  const ticTacToe = await prisma.game.create({
    data: {
      name: "Tic Tac Toe",
      description: "Simple grid-based strategy game",
      category: "CASUAL",
      minPlayers: 2,
      maxPlayers: 2,
      averageGameTime: 5,
      isActive: true,
      rules: "Get three in a row",
      instructions: "Place X or O to get three in a row",
      difficultyLevel: "beginner",
    },
  });
  games.push(ticTacToe);

  return games;
}

// Create institutions
async function createInstitutions() {
  const institutions = [];

  for (const institutionData of EXTENDED_ZIMBABWE_DATA.INSTITUTIONS) {
    const institution = await prisma.institution.create({
      data: {
        name: institutionData.name,
        type: institutionData.type,
        province: institutionData.province,
        isActive: true,
        isVerified: true,
      },
    });
    institutions.push(institution);
  }

  return institutions;
}

// Create mobile money providers
async function createMobileMoneyProviders() {
  const providers = [];
  const providerData = [
    { name: "EcoCash", code: "ECOCASH", isActive: true },
    { name: "OneMoney", code: "ONEMONEY", isActive: true },
    { name: "TeleCash", code: "TELECASH", isActive: true },
  ];

  for (const data of providerData) {
    const provider = await prisma.mobileMoneyProvider.create({
      data,
    });
    providers.push(provider);
  }

  return providers;
}

// Create comprehensive user base
async function createUsers(institutions: any[]) {
  const users: any[] = [];
  const totalUsers = COMPREHENSIVE_TEST_CONFIG.USERS.TOTAL;

  // Create different user types with varied skill levels
  const userTypes = [
    { role: "super_admin", count: Math.floor(totalUsers * 0.03) },
    { role: "admin", count: Math.floor(totalUsers * 0.02) },
    { role: "moderator", count: Math.floor(totalUsers * 0.1) },
    { role: "user", count: totalUsers - Math.floor(totalUsers * 0.15) },
  ];

  let userIndex = 1;

  for (const userType of userTypes) {
    for (let i = 0; i < userType.count; i++) {
      const firstName = randomChoice(EXTENDED_ZIMBABWE_DATA.NAMES.FIRST_NAMES);
      const lastName = randomChoice(EXTENDED_ZIMBABWE_DATA.NAMES.LAST_NAMES);
      const province = randomChoice(EXTENDED_ZIMBABWE_DATA.PROVINCES);
      const city = randomChoice(
        EXTENDED_ZIMBABWE_DATA.CITIES[province] || [province]
      );
      const isStudent = Math.random() < 0.6 && userType.role === "user";
      const institution = isStudent ? randomChoice(institutions) : null;

      // Create realistic skill distribution
      const skillLevel = Math.random();
      let rating, gamesPlayed, winRate;

      if (skillLevel < 0.1) {
        // Expert players (10%)
        rating = randomInt(1800, 2200);
        gamesPlayed = randomInt(200, 1000);
        winRate = randomFloat(0.65, 0.85);
      } else if (skillLevel < 0.3) {
        // Advanced players (20%)
        rating = randomInt(1500, 1799);
        gamesPlayed = randomInt(100, 400);
        winRate = randomFloat(0.55, 0.75);
      } else if (skillLevel < 0.7) {
        // Intermediate players (40%)
        rating = randomInt(1200, 1499);
        gamesPlayed = randomInt(30, 150);
        winRate = randomFloat(0.45, 0.65);
      } else {
        // Beginner players (30%)
        rating = randomInt(800, 1199);
        gamesPlayed = randomInt(5, 50);
        winRate = randomFloat(0.25, 0.55);
      }

      const gamesWon = Math.floor(gamesPlayed * winRate);
      const points = gamesWon * 10 + randomInt(0, 50);

      const user = await prisma.user.create({
        data: {
          email: `${userType.role}${userIndex}@nhandare.co.zw`,
          username: `${firstName}${lastName}${userIndex}`,
          password: await hash("password123", 12),
          firstName,
          lastName,
          role: userType.role as any,
          permissions: userType.role === "super_admin" ? ["*"] : [],
          isActive: true,
          isVerified:
            Math.random() < COMPREHENSIVE_TEST_CONFIG.USERS.VERIFIED_PERCENTAGE,
          province,
          city,
          location: `${city}, ${province}`,
          phoneNumber: generateZimbabwePhone(),
          ecocashNumber: generateZimbabwePhone(),
          mobileMoneyProvider: randomChoice([
            "ECOCASH",
            "ONEMONEY",
            "TELECASH",
          ]),
          preferredLanguage: randomChoice(["en", "sn", "nd"]),
          isStudent,
          institution: institution?.name || null,
          points,
          rank: 0, // Will be updated after all users are created
          gamesPlayed,
          gamesWon,
          winRate: parseFloat(winRate.toFixed(3)),
          dateOfBirth: randomDate(new Date(1985, 0, 1), new Date(2005, 0, 1)),
          gender: randomChoice(["male", "female", "other"]),
          isVerifiedID: Math.random() < 0.7,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userType.role}${userIndex}`,
          bio: isStudent
            ? `${firstName} - Student at ${institution?.name}. Chess rating: ${rating}`
            : `${firstName} - Gaming enthusiast from ${province}. Chess rating: ${rating}`,
        },
      });

      users.push(user);
      userIndex++;
    }
  }

  // Update user rankings based on points
  const sortedUsers = users.sort((a, b) => b.points - a.points);
  for (let i = 0; i < sortedUsers.length; i++) {
    await prisma.user.update({
      where: { id: sortedUsers[i].id },
      data: { rank: i + 1 },
    });
  }

  return users;
}

// Create comprehensive tournament testing dataset
async function createTournaments(games: any[], users: any[]) {
  const tournaments: any[] = [];
  const regularUsers = users.filter((u) => u.role === "user");

  console.log("🧪 Creating comprehensive bracket testing tournaments...");

  // Create comprehensive bracket type testing
  for (const [bracketType, config] of Object.entries(
    COMPREHENSIVE_TEST_CONFIG.TOURNAMENTS.BRACKET_TESTING
  )) {
    console.log(`Creating ${config.COUNT} ${bracketType} tournaments...`);

    for (let i = 0; i < config.COUNT; i++) {
      const playerCount = randomChoice(config.PLAYER_COUNTS);
      const seedingConfig = randomChoice(
        COMPREHENSIVE_TEST_CONFIG.TOURNAMENTS.SEEDING_COMBINATIONS
      );
      const game = randomChoice(games);
      const status = randomChoice(["OPEN", "ACTIVE", "COMPLETED"]);

      const baseDate = new Date();
      let registrationStart, registrationEnd, startDate, endDate;

      switch (status) {
        case "OPEN":
          registrationStart = new Date(
            baseDate.getTime() - 7 * 24 * 60 * 60 * 1000
          );
          registrationEnd = new Date(
            baseDate.getTime() + 14 * 24 * 60 * 60 * 1000
          );
          startDate = new Date(baseDate.getTime() + 15 * 24 * 60 * 60 * 1000);
          endDate = new Date(baseDate.getTime() + 22 * 24 * 60 * 60 * 1000);
          break;
        case "ACTIVE":
          registrationStart = new Date(
            baseDate.getTime() - 21 * 24 * 60 * 60 * 1000
          );
          registrationEnd = new Date(
            baseDate.getTime() - 7 * 24 * 60 * 60 * 1000
          );
          startDate = new Date(baseDate.getTime() - 3 * 24 * 60 * 60 * 1000);
          endDate = new Date(baseDate.getTime() + 4 * 24 * 60 * 60 * 1000);
          break;
        case "COMPLETED":
          registrationStart = new Date(
            baseDate.getTime() - 45 * 24 * 60 * 60 * 1000
          );
          registrationEnd = new Date(
            baseDate.getTime() - 30 * 24 * 60 * 60 * 1000
          );
          startDate = new Date(baseDate.getTime() - 21 * 24 * 60 * 60 * 1000);
          endDate = new Date(baseDate.getTime() - 14 * 24 * 60 * 60 * 1000);
          break;
      }

      const province = randomChoice(EXTENDED_ZIMBABWE_DATA.PROVINCES);
      const city = randomChoice(
        EXTENDED_ZIMBABWE_DATA.CITIES[province] || [province]
      );
      const entryFee = randomFloat(10, 100);
      const prizePool = entryFee * playerCount * 0.8; // 80% of entry fees as prize pool

      const tournament = await prisma.tournament.create({
        data: {
          title: `${bracketType} Test #${i + 1} - ${playerCount}P - ${
            seedingConfig.name
          }`,
          description: `Comprehensive testing tournament for ${bracketType} bracket system with ${playerCount} players using ${seedingConfig.name} seeding. Testing edge cases and validation.`,
          prizePool,
          entryFee,
          maxPlayers: playerCount,
          currentPlayers:
            status === "OPEN"
              ? randomInt(2, Math.max(2, playerCount - 5))
              : playerCount,
          status: status as any,
          province,
          city,
          location: `${city}, ${province}`,
          venue: randomChoice([
            "Online Platform",
            `${city} Community Center`,
            `University of Zimbabwe - ${city} Campus`,
            "Gaming Lounge",
          ]),
          isOnlineOnly: Math.random() < 0.7,
          targetAudience: randomChoice(["university", "corporate", "public"]),
          sponsorName:
            Math.random() < 0.3
              ? randomChoice(["Econet", "CBZ Bank", "Delta"])
              : null,
          minimumAge: randomChoice([null, 13, 16, 18]),
          maxAge: randomChoice([null, 25, 35, 50]),
          category: randomChoice([
            "UNIVERSITY",
            "CORPORATE",
            "PUBLIC",
            "INVITATION_ONLY",
          ]),
          difficultyLevel: randomChoice([
            "beginner",
            "intermediate",
            "advanced",
          ]),
          prizeBreakdown: {
            "1st": Math.floor(prizePool * 0.5),
            "2nd": Math.floor(prizePool * 0.3),
            "3rd": Math.floor(prizePool * 0.15),
            "4th": Math.floor(prizePool * 0.05),
          },
          localCurrency: "USD",
          platformFeeRate: 0.2,
          registrationStart,
          registrationEnd,
          startDate,
          endDate,
          gameId: game.id,
          bracketType: bracketType as any,
          bracketConfig: {
            useAdvancedSeeding: seedingConfig.name !== "Rating Only",
            seedingOptions: seedingConfig,
            testingNotes: `Testing ${bracketType} with ${playerCount} players and ${seedingConfig.name} seeding`,
          },
          // Will be generated by bracket service later
          bracket: {
            type: bracketType,
            playerCount,
            seedingConfig: seedingConfig.name,
            generated: false,
            testCase: true,
          },
        },
      });

      tournaments.push(tournament);
    }
  }

  // Create additional tournaments for general testing
  const additionalTournamentCount = 20;
  console.log(
    `Creating ${additionalTournamentCount} additional general tournaments...`
  );

  for (let i = 0; i < additionalTournamentCount; i++) {
    const game = randomChoice(games);
    const bracketType = randomChoice([
      "SINGLE_ELIMINATION",
      "DOUBLE_ELIMINATION",
      "ROUND_ROBIN",
      "SWISS",
    ]);
    const playerCount = randomChoice([8, 16, 24, 32, 48, 64]);
    const status = weightedRandomChoice([
      { value: "OPEN", weight: 0.3 },
      { value: "ACTIVE", weight: 0.25 },
      { value: "COMPLETED", weight: 0.35 },
      { value: "CANCELLED", weight: 0.1 },
    ]);

    const baseDate = new Date();
    const registrationStart = randomDate(
      new Date(baseDate.getTime() - 60 * 24 * 60 * 60 * 1000),
      new Date(baseDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    );
    const registrationEnd = randomDate(
      registrationStart,
      new Date(registrationStart.getTime() + 14 * 24 * 60 * 60 * 1000)
    );
    const startDate = randomDate(
      registrationEnd,
      new Date(registrationEnd.getTime() + 7 * 24 * 60 * 60 * 1000)
    );
    const endDate = randomDate(
      startDate,
      new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    );

    const province = randomChoice(EXTENDED_ZIMBABWE_DATA.PROVINCES);
    const city = randomChoice(
      EXTENDED_ZIMBABWE_DATA.CITIES[province] || [province]
    );
    const entryFee = randomFloat(5, 150);
    const prizePool = entryFee * playerCount * randomFloat(0.7, 0.9);

    const tournament = await prisma.tournament.create({
      data: {
        title: `${game.name} ${bracketType.replace(
          "_",
          " "
        )} Championship ${new Date().getFullYear()}`,
        description: `Professional ${
          game.name
        } tournament featuring ${bracketType
          .replace("_", " ")
          .toLowerCase()} format. Join ${playerCount} players competing for exciting prizes!`,
        prizePool,
        entryFee,
        maxPlayers: playerCount,
        currentPlayers:
          status === "OPEN" ? randomInt(0, playerCount - 5) : playerCount,
        status: status as any,
        province,
        city,
        location: `${city}, ${province}`,
        venue: randomChoice([
          "Online Platform",
          `${city} Convention Center`,
          "University Campus",
          "Gaming Arena",
        ]),
        isOnlineOnly: Math.random() < 0.6,
        targetAudience: randomChoice(["university", "corporate", "public"]),
        sponsorName:
          Math.random() < 0.4
            ? randomChoice(["Econet", "CBZ Bank", "Delta", "NetOne"])
            : null,
        minimumAge: randomChoice([null, 16, 18]),
        maxAge: randomChoice([null, 30, 50]),
        category: randomChoice(["UNIVERSITY", "CORPORATE", "PUBLIC"]),
        difficultyLevel: randomChoice(["beginner", "intermediate", "advanced"]),
        prizeBreakdown: generatePrizeBreakdown(prizePool, playerCount),
        localCurrency: "USD",
        platformFeeRate: 0.2,
        registrationStart,
        registrationEnd,
        startDate,
        endDate,
        gameId: game.id,
        bracketType: bracketType as any,
        bracket: {
          type: bracketType,
          playerCount,
          generated: false,
          isGeneral: true,
        },
      },
    });

    tournaments.push(tournament);
  }

  console.log(
    `✅ Created ${tournaments.length} tournaments for comprehensive testing`
  );
  return tournaments;
}

// Helper function for weighted random selection
function weightedRandomChoice<T>(choices: { value: T; weight: number }[]): T {
  const totalWeight = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let random = Math.random() * totalWeight;

  for (const choice of choices) {
    random -= choice.weight;
    if (random <= 0) {
      return choice.value;
    }
  }

  return choices[choices.length - 1].value;
}

// Generate prize breakdown based on tournament size
function generatePrizeBreakdown(prizePool: number, playerCount: number) {
  const prizeBreakdown: Record<string, number> = {};

  if (playerCount >= 4) {
    prizeBreakdown["1st"] = Math.floor(prizePool * 0.5);
    prizeBreakdown["2nd"] = Math.floor(prizePool * 0.3);
    prizeBreakdown["3rd"] = Math.floor(prizePool * 0.15);
    prizeBreakdown["4th"] = Math.floor(prizePool * 0.05);
  } else if (playerCount >= 3) {
    prizeBreakdown["1st"] = Math.floor(prizePool * 0.6);
    prizeBreakdown["2nd"] = Math.floor(prizePool * 0.3);
    prizeBreakdown["3rd"] = Math.floor(prizePool * 0.1);
  } else {
    prizeBreakdown["1st"] = Math.floor(prizePool * 0.7);
    prizeBreakdown["2nd"] = Math.floor(prizePool * 0.3);
  }

  return prizeBreakdown;
}

// Create tournament players for comprehensive testing
async function createTournamentPlayers(tournaments: any[], users: any[]) {
  const tournamentPlayers: any[] = [];
  const regularUsers = users.filter((u) => u.role === "user");

  console.log("👥 Creating tournament players for all tournaments...");

  for (const tournament of tournaments) {
    if (tournament.status === "OPEN" && tournament.currentPlayers === 0) {
      continue; // Skip empty open tournaments
    }

    const playerCount = tournament.currentPlayers;
    const availableUsers = [...regularUsers];
    const selectedUsers = [];

    // Ensure we have enough users
    while (selectedUsers.length < playerCount && availableUsers.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableUsers.length);
      const user = availableUsers.splice(randomIndex, 1)[0];
      selectedUsers.push(user);
    }

    // Create tournament players with varied join times
    for (let i = 0; i < selectedUsers.length; i++) {
      const user = selectedUsers[i];
      const joinDate = randomDate(
        tournament.registrationStart,
        tournament.status === "OPEN" ? new Date() : tournament.registrationEnd
      );

      const tournamentPlayer = await prisma.tournamentPlayer.create({
        data: {
          tournamentId: tournament.id,
          userId: user.id,
          registeredAt: joinDate,
          seedNumber: i + 1, // Will be updated by seeding algorithm
          initialRating: user.gamesPlayed > 0 ? randomInt(800, 2200) : 1200,
          currentRating: user.gamesPlayed > 0 ? randomInt(800, 2200) : 1200,
          isActive: true,
          hasCompletedProfile: Math.random() < 0.9,
          emergencyContact:
            Math.random() < 0.8 ? generateZimbabwePhone() : null,
          dietaryRestrictions:
            Math.random() < 0.1
              ? randomChoice(["vegetarian", "halal", "gluten-free"])
              : null,
          accommodationNeeds:
            Math.random() < 0.05 ? "wheelchair accessible" : null,
        },
      });

      tournamentPlayers.push(tournamentPlayer);
    }
  }

  console.log(
    `✅ Created ${tournamentPlayers.length} tournament player registrations`
  );
  return tournamentPlayers;
}

// Create comprehensive match dataset
async function createMatches(tournaments: any[], users: any[]) {
  const matches: any[] = [];
  const activeAndCompletedTournaments = tournaments.filter(
    (t) => t.status === "ACTIVE" || t.status === "COMPLETED"
  );

  console.log("🎮 Creating matches for active and completed tournaments...");

  for (const tournament of activeAndCompletedTournaments) {
    const tournamentPlayers = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
      include: { user: true },
    });

    if (tournamentPlayers.length < 2) continue;

    // Calculate expected number of matches based on bracket type
    let expectedMatches = 0;
    const playerCount = tournamentPlayers.length;

    switch (tournament.bracketType) {
      case "SINGLE_ELIMINATION":
        expectedMatches = playerCount - 1;
        break;
      case "DOUBLE_ELIMINATION":
        expectedMatches = (playerCount - 1) * 2; // Approximate
        break;
      case "ROUND_ROBIN":
        expectedMatches = (playerCount * (playerCount - 1)) / 2;
        break;
      case "SWISS":
        const rounds = Math.ceil(Math.log2(playerCount));
        expectedMatches = rounds * Math.floor(playerCount / 2);
        break;
    }

    // Create matches based on tournament status
    const matchesToCreate =
      tournament.status === "COMPLETED"
        ? expectedMatches
        : Math.floor(expectedMatches * randomFloat(0.3, 0.8));

    for (let i = 0; i < matchesToCreate; i++) {
      const player1 = randomChoice(tournamentPlayers);
      let player2 = randomChoice(tournamentPlayers);

      // Ensure different players
      while (player2.id === player1.id) {
        player2 = randomChoice(tournamentPlayers);
      }

      const matchDate = randomDate(tournament.startDate, tournament.endDate);
      const status = weightedRandomChoice([
        {
          value: "COMPLETED",
          weight:
            COMPREHENSIVE_TEST_CONFIG.MATCHES.STATUS_DISTRIBUTION.COMPLETED,
        },
        {
          value: "ACTIVE",
          weight: COMPREHENSIVE_TEST_CONFIG.MATCHES.STATUS_DISTRIBUTION.ACTIVE,
        },
        {
          value: "PENDING",
          weight: COMPREHENSIVE_TEST_CONFIG.MATCHES.STATUS_DISTRIBUTION.PENDING,
        },
        {
          value: "CANCELLED",
          weight:
            COMPREHENSIVE_TEST_CONFIG.MATCHES.STATUS_DISTRIBUTION.CANCELLED,
        },
      ]);

      let winnerId = null;
      let result = null;

      if (status === "COMPLETED") {
        // Determine winner based on rating with some randomness
        const player1Rating = player1.currentRating;
        const player2Rating = player2.currentRating;
        const ratingDiff = player1Rating - player2Rating;
        const player1WinProbability = 1 / (1 + Math.pow(10, -ratingDiff / 400));

        winnerId =
          Math.random() < player1WinProbability
            ? player1.userId
            : player2.userId;
        result = winnerId === player1.userId ? "PLAYER1_WIN" : "PLAYER2_WIN";

        // Small chance of draw
        if (Math.random() < 0.05) {
          winnerId = null;
          result = "DRAW";
        }
      }

      const match = await prisma.match.create({
        data: {
          tournamentId: tournament.id,
          player1Id: player1.userId,
          player2Id: player2.userId,
          gameId: tournament.gameId,
          status: status as any,
          result: result as any,
          winnerId,
          scheduledAt: matchDate,
          startedAt: status !== "PENDING" ? matchDate : null,
          completedAt:
            status === "COMPLETED"
              ? new Date(matchDate.getTime() + randomInt(300000, 3600000))
              : null,
          timeControl: randomChoice(["5+0", "10+5", "15+10", "30+0"]),
          isRated: true,
          round: Math.floor(i / (tournamentPlayers.length / 2)) + 1,
          matchNumber: (i % (tournamentPlayers.length / 2)) + 1,
          notes:
            Math.random() < 0.1
              ? "Exciting match with tactical brilliance!"
              : null,
        },
      });

      matches.push(match);
    }
  }

  console.log(`✅ Created ${matches.length} matches across all tournaments`);
  return matches;
}

// Create game sessions
async function createGameSessions(matches: any[], users: any[], games: any[]) {
  const gameSessions: any[] = [];
  const completedMatches = matches.filter((m) => m.status === "COMPLETED");

  console.log("🎯 Creating game sessions for completed matches...");

  for (const match of completedMatches) {
    if (Math.random() < 0.8) {
      // 80% of completed matches have game sessions
      const duration = randomInt(300, 3600); // 5 minutes to 1 hour
      const moves = Math.floor(duration / 30); // Approximate moves based on duration

      const gameSession = await prisma.gameSession.create({
        data: {
          matchId: match.id,
          gameId: match.gameId,
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          winnerId: match.winnerId,
          startTime: match.startedAt,
          endTime: match.completedAt,
          duration,
          moves,
          gameState: {
            type: "chess",
            moves: generateRandomMoves(moves),
            finalPosition: "game_completed",
          },
          isActive: false,
          metadata: {
            timeControl: match.timeControl,
            opening: randomChoice([
              "Sicilian Defense",
              "Ruy Lopez",
              "Queen's Gambit",
              "King's Indian Defense",
              "French Defense",
              "Caro-Kann Defense",
            ]),
            endgameType:
              match.result === "DRAW"
                ? "draw"
                : randomChoice(["checkmate", "resignation", "time forfeit"]),
          },
        },
      });

      gameSessions.push(gameSession);
    }
  }

  console.log(`✅ Created ${gameSessions.length} game sessions`);
  return gameSessions;
}

// Generate random chess moves for testing
function generateRandomMoves(moveCount: number): string[] {
  const moves = [];
  const pieces = ["e4", "d4", "Nf3", "c4", "g3", "f4", "b3", "Nc3"];

  for (let i = 0; i < moveCount; i++) {
    moves.push(randomChoice(pieces));
  }

  return moves;
}

// Create game statistics
async function createGameStatistics(users: any[], games: any[]) {
  const gameStatistics: any[] = [];
  const regularUsers = users.filter((u) => u.role === "user");

  console.log("📊 Creating game statistics for users...");

  for (const user of regularUsers) {
    for (const game of games) {
      if (Math.random() < 0.9) {
        // 90% of users have stats for each game
        const gamesPlayed = user.gamesPlayed + randomInt(0, 50);
        const winRate = user.winRate + randomFloat(-0.1, 0.1);
        const gamesWon = Math.floor(
          gamesPlayed * Math.max(0, Math.min(1, winRate))
        );

        const gameStats = await prisma.gameStatistics.create({
          data: {
            userId: user.id,
            gameId: game.id,
            gamesPlayed,
            gamesWon,
            gamesLost: gamesPlayed - gamesWon,
            winRate: parseFloat(
              (gamesWon / Math.max(1, gamesPlayed)).toFixed(3)
            ),
            rating: randomInt(800, 2200),
            peakRating: randomInt(800, 2400),
            longestWinStreak: randomInt(0, 15),
            longestLoseStreak: randomInt(0, 10),
            averageGameDuration: randomInt(300, 3600),
            totalPlayTime: gamesPlayed * randomInt(300, 3600),
            achievements: randomInt(0, 10),
            rank: randomInt(1, regularUsers.length),
            lastPlayed: randomDate(
              new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
              new Date()
            ),
          },
        });

        gameStatistics.push(gameStats);
      }
    }
  }

  console.log(`✅ Created ${gameStatistics.length} game statistics records`);
  return gameStatistics;
}

// Create remaining data (achievements, payments, etc.)
// ... (Additional functions similar to the original seeder but expanded for comprehensive testing)

// Main seeding function
async function main() {
  console.log("🚀 Starting Comprehensive Bracket System Testing Seeder...");
  console.log("📋 Configuration:", COMPREHENSIVE_TEST_CONFIG);

  try {
    // Clear existing data
    await clearExistingData();
    console.log("✅ Database cleared");

    // Create core data
    const games = await createGames();
    console.log(`✅ Created ${games.length} games`);

    const institutions = await createInstitutions();
    console.log(`✅ Created ${institutions.length} institutions`);

    const mobileMoneyProviders = await createMobileMoneyProviders();
    console.log(
      `✅ Created ${mobileMoneyProviders.length} mobile money providers`
    );

    const users = await createUsers(institutions);
    console.log(`✅ Created ${users.length} users`);

    const tournaments = await createTournaments(games, users);
    console.log(`✅ Created ${tournaments.length} tournaments`);

    const tournamentPlayers = await createTournamentPlayers(tournaments, users);
    console.log(`✅ Created ${tournamentPlayers.length} tournament players`);

    const matches = await createMatches(tournaments, users);
    console.log(`✅ Created ${matches.length} matches`);

    const gameSessions = await createGameSessions(matches, users, games);
    console.log(`✅ Created ${gameSessions.length} game sessions`);

    const gameStatistics = await createGameStatistics(users, games);
    console.log(`✅ Created ${gameStatistics.length} game statistics`);

    console.log("\n🎉 Comprehensive Bracket System Testing Seeder Completed!");
    console.log("📈 Summary:");
    console.log(`   👥 Users: ${users.length}`);
    console.log(`   🏆 Tournaments: ${tournaments.length}`);
    console.log(`   ⚔️ Matches: ${matches.length}`);
    console.log(`   📊 Game Statistics: ${gameStatistics.length}`);
    console.log(`   🎮 Game Sessions: ${gameSessions.length}`);

    console.log("\n🧪 Bracket Testing Coverage:");
    console.log(
      `   🎯 Single Elimination: ${COMPREHENSIVE_TEST_CONFIG.TOURNAMENTS.BRACKET_TESTING.SINGLE_ELIMINATION.COUNT} tournaments`
    );
    console.log(
      `   🔄 Double Elimination: ${COMPREHENSIVE_TEST_CONFIG.TOURNAMENTS.BRACKET_TESTING.DOUBLE_ELIMINATION.COUNT} tournaments`
    );
    console.log(
      `   🔁 Round Robin: ${COMPREHENSIVE_TEST_CONFIG.TOURNAMENTS.BRACKET_TESTING.ROUND_ROBIN.COUNT} tournaments`
    );
    console.log(
      `   🇨🇭 Swiss System: ${COMPREHENSIVE_TEST_CONFIG.TOURNAMENTS.BRACKET_TESTING.SWISS.COUNT} tournaments`
    );

    console.log("\n🔬 Advanced Seeding Testing:");
    console.log(
      `   📐 Seeding Combinations: ${COMPREHENSIVE_TEST_CONFIG.TOURNAMENTS.SEEDING_COMBINATIONS.length} different configurations`
    );

    console.log("\n🌟 Ready for comprehensive frontend and backend testing!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export default main;
