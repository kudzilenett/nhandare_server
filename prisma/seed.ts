import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🇿🇼 Seeding Zimbabwe gaming platform...");

  // Clean up existing data
  await prisma.userAchievement.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.gameStatistic.deleteMany();
  await prisma.gameSession.deleteMany();
  await prisma.match.deleteMany();
  await prisma.tournamentPlayer.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.mobileMoneyProvider.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.zimbabweLocation.deleteMany();
  await prisma.game.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Zimbabwe locations
  console.log("📍 Creating Zimbabwe locations...");
  const locations = [
    {
      province: "Harare",
      city: "Harare",
      latitude: -17.8292,
      longitude: 31.0522,
    },
    {
      province: "Harare",
      city: "Chitungwiza",
      latitude: -18.01,
      longitude: 31.07,
    },
    { province: "Harare", city: "Epworth", latitude: -17.89, longitude: 31.15 },
    {
      province: "Bulawayo",
      city: "Bulawayo",
      latitude: -20.1594,
      longitude: 28.5886,
    },
    {
      province: "Manicaland",
      city: "Mutare",
      latitude: -18.9707,
      longitude: 32.6473,
    },
    {
      province: "Manicaland",
      city: "Rusape",
      latitude: -18.5276,
      longitude: 32.1254,
    },
    {
      province: "Mashonaland Central",
      city: "Bindura",
      latitude: -17.3017,
      longitude: 31.3314,
    },
    {
      province: "Mashonaland East",
      city: "Marondera",
      latitude: -18.1851,
      longitude: 31.5513,
    },
    {
      province: "Mashonaland West",
      city: "Chinhoyi",
      latitude: -17.3572,
      longitude: 30.1985,
    },
    {
      province: "Masvingo",
      city: "Masvingo",
      latitude: -20.0637,
      longitude: 30.8408,
    },
    {
      province: "Matabeleland North",
      city: "Hwange",
      latitude: -18.3644,
      longitude: 26.5023,
    },
    {
      province: "Matabeleland South",
      city: "Gwanda",
      latitude: -20.9334,
      longitude: 29.002,
    },
    {
      province: "Midlands",
      city: "Gweru",
      latitude: -19.4503,
      longitude: 29.8119,
    },
    {
      province: "Midlands",
      city: "Kwekwe",
      latitude: -18.9167,
      longitude: 29.8167,
    },
  ];

  await prisma.zimbabweLocation.createMany({
    data: locations,
  });

  // 2. Create institutions
  console.log("🏫 Creating institutions...");
  const institutions = [
    {
      name: "University of Zimbabwe",
      type: "university",
      city: "Harare",
      province: "Harare",
      website: "https://www.uz.ac.zw",
    },
    {
      name: "National University of Science and Technology",
      type: "university",
      city: "Bulawayo",
      province: "Bulawayo",
      website: "https://www.nust.ac.zw",
    },
    {
      name: "Midlands State University",
      type: "university",
      city: "Gweru",
      province: "Midlands",
      website: "https://www.msu.ac.zw",
    },
    {
      name: "Harare Institute of Technology",
      type: "university",
      city: "Harare",
      province: "Harare",
      website: "https://www.hit.ac.zw",
    },
    {
      name: "Chinhoyi University of Technology",
      type: "university",
      city: "Chinhoyi",
      province: "Mashonaland West",
      website: "https://www.cut.ac.zw",
    },
    {
      name: "Great Zimbabwe University",
      type: "university",
      city: "Masvingo",
      province: "Masvingo",
      website: "https://www.gzu.ac.zw",
    },
    {
      name: "Bindura University of Science Education",
      type: "university",
      city: "Bindura",
      province: "Mashonaland Central",
      website: "https://www.buse.ac.zw",
    },
    // Major companies
    {
      name: "Econet Wireless",
      type: "company",
      city: "Harare",
      province: "Harare",
      website: "https://www.econet.co.zw",
    },
    {
      name: "CBZ Bank",
      type: "company",
      city: "Harare",
      province: "Harare",
      website: "https://www.cbz.co.zw",
    },
    {
      name: "Delta Corporation",
      type: "company",
      city: "Harare",
      province: "Harare",
      website: "https://www.delta.co.zw",
    },
  ];

  await prisma.institution.createMany({
    data: institutions,
  });

  // 3. Create mobile money providers
  console.log("💰 Creating mobile money providers...");
  const mobileMoneyProviders = [
    {
      name: "EcoCash",
      code: "PZW211",
      minAmount: 1.0,
      maxAmount: 3000.0,
      feeStructure: {
        type: "percentage",
        rate: 0.01,
        minimumFee: 0.05,
      },
    },
    {
      name: "OneMoney",
      code: "PZW212",
      minAmount: 1.0,
      maxAmount: 1000.0,
      feeStructure: {
        type: "percentage",
        rate: 0.015,
        minimumFee: 0.05,
      },
    },
    {
      name: "Zimswitch USD",
      code: "PZW215",
      minAmount: 0.1,
      maxAmount: 3000.0,
      feeStructure: {
        type: "percentage",
        rate: 0.02,
        minimumFee: 0.1,
      },
    },
    {
      name: "Innbucks USD",
      code: "PZW212",
      minAmount: 1.0,
      maxAmount: 1000.0,
      feeStructure: {
        type: "percentage",
        rate: 0.015,
        minimumFee: 0.05,
      },
    },
  ];

  await prisma.mobileMoneyProvider.createMany({
    data: mobileMoneyProviders,
  });

  // 4. Create Zimbabwe-appropriate games
  console.log("🎮 Creating games...");
  const games = [
    {
      name: "Chess",
      description: "Strategic board game popular in Zimbabwean universities",
      emoji: "♟️",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 900000, // 15 minutes
      rules: {
        timeControl: "15+10",
        rules: "FIDE standard chess rules",
        ratingsystem: "ELO",
      },
      isActive: true,
    },
    {
      name: "Draughts",
      description: "Traditional board game played across Zimbabwe",
      emoji: "🔴",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 600000, // 10 minutes
      rules: {
        variant: "International draughts",
        boardSize: "10x10",
      },
      isActive: true,
    },
    {
      name: "Whot!",
      description: "Popular Zimbabwean card game",
      emoji: "🃏",
      minPlayers: 2,
      maxPlayers: 6,
      averageTimeMs: 900000, // 15 minutes
      rules: {
        cardCount: 108,
        specialCards: ["Pick 2", "Pick 3", "General Market", "Hold On"],
      },
      isActive: true,
    },
    {
      name: "Connect 4",
      description: "Four in a row - quick competitive matches",
      emoji: "🔵",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 300000, // 5 minutes
      rules: {
        boardSize: "7x6",
        winCondition: "4 in a row",
      },
      isActive: true,
    },
  ];

  const createdGames = await Promise.all(
    games.map((game) => prisma.game.create({ data: game }))
  );

  // 5. Create test users with Zimbabwe details
  console.log("👥 Creating test users...");
  const hashedPassword = await bcrypt.hash("password123", 12);

  const users = [
    {
      email: "tafara.chess@uz.ac.zw",
      username: "TafaraChessKing",
      password: hashedPassword,
      firstName: "Tafara",
      lastName: "Mukamuri",
      phoneNumber: "+263771234567",
      province: "Harare",
      city: "Harare",
      location: "Harare, Harare",
      institution: "University of Zimbabwe",
      isStudent: true,
      preferredLanguage: "en",
      isVerified: true,
      points: 1250,
      gamesPlayed: 45,
      gamesWon: 32,
      winRate: 0.71,
    },
    {
      email: "chipo.gamer@nust.ac.zw",
      username: "ChipoGamerQueen",
      password: hashedPassword,
      firstName: "Chipo",
      lastName: "Ndebele",
      phoneNumber: "+263712345678",
      province: "Bulawayo",
      city: "Bulawayo",
      location: "Bulawayo, Bulawayo",
      institution: "National University of Science and Technology",
      isStudent: true,
      preferredLanguage: "nd",
      isVerified: true,
      points: 980,
      gamesPlayed: 38,
      gamesWon: 23,
      winRate: 0.61,
    },
    {
      email: "takudzwa.pro@gmail.com",
      username: "TakudzwaStrategyPro",
      password: hashedPassword,
      firstName: "Takudzwa",
      lastName: "Chimbindi",
      phoneNumber: "+263787654321",
      province: "Midlands",
      city: "Gweru",
      location: "Gweru, Midlands",
      institution: "Midlands State University",
      isStudent: true,
      preferredLanguage: "sn",
      isVerified: true,
      points: 1450,
      gamesPlayed: 52,
      gamesWon: 38,
      winRate: 0.73,
    },
    {
      email: "admin@nhandare.zw",
      username: "NhandareAdmin",
      password: hashedPassword,
      firstName: "Admin",
      lastName: "User",
      phoneNumber: "+263771000000",
      province: "Harare",
      city: "Harare",
      location: "Harare, Harare",
      institution: "Nhandare Gaming Platform",
      isStudent: false,
      preferredLanguage: "en",
      isVerified: true,
      isActive: true,
      points: 0,
    },
  ];

  const createdUsers = await Promise.all(
    users.map((user) => prisma.user.create({ data: user }))
  );

  // 6. Create sample tournaments
  console.log("🏆 Creating sample tournaments...");
  const tournaments = [
    {
      title: "University of Zimbabwe Chess Championship",
      description: "Annual chess tournament for UZ students and staff",
      gameId: createdGames[0].id, // Chess
      entryFee: 5.0,
      prizePool: 200.0,
      maxPlayers: 32,
      province: "Harare",
      city: "Harare",
      location: "UZ Campus, Harare",
      venue: "University of Zimbabwe Main Hall",
      isOnlineOnly: false,
      targetAudience: "university",
      category: "UNIVERSITY" as const,
      difficultyLevel: "intermediate",
      localCurrency: "USD",
      registrationStart: new Date("2024-02-01T09:00:00Z"),
      registrationEnd: new Date("2024-02-15T23:59:59Z"),
      startDate: new Date("2024-02-20T10:00:00Z"),
      endDate: new Date("2024-02-22T18:00:00Z"),
      prizeBreakdown: {
        first: 120,
        second: 50,
        third: 30,
      },
    },
    {
      title: "Bulawayo Draughts Open",
      description: "Open draughts tournament for all skill levels",
      gameId: createdGames[1].id, // Draughts
      entryFee: 3.0,
      prizePool: 150.0,
      maxPlayers: 24,
      province: "Bulawayo",
      city: "Bulawayo",
      location: "Bulawayo City Centre",
      isOnlineOnly: true,
      targetAudience: "public",
      category: "PUBLIC",
      difficultyLevel: "beginner",
      localCurrency: "USD",
      registrationStart: new Date("2024-02-05T09:00:00Z"),
      registrationEnd: new Date("2024-02-18T23:59:59Z"),
      startDate: new Date("2024-02-25T14:00:00Z"),
      endDate: new Date("2024-02-25T18:00:00Z"),
      prizeBreakdown: {
        first: 90,
        second: 40,
        third: 20,
      },
    },
  ];

  const createdTournaments = await Promise.all(
    tournaments.map((tournament) =>
      prisma.tournament.create({ data: tournament })
    )
  );

  // 7. Create achievements
  console.log("🏅 Creating achievements...");
  const achievements = [
    {
      name: "First Victory",
      description: "Win your first game",
      icon: "🎉",
      type: "GAMES_WON",
      requirements: { gamesWon: 1 },
      points: 50,
    },
    {
      name: "Chess Master",
      description: "Win 10 chess games",
      icon: "♟️",
      type: "GAMES_WON",
      requirements: { gamesWon: 10, gameType: "Chess" },
      points: 200,
    },
    {
      name: "Tournament Champion",
      description: "Win your first tournament",
      icon: "🏆",
      type: "TOURNAMENTS_WON",
      requirements: { tournamentsWon: 1 },
      points: 500,
    },
    {
      name: "Zimbabwe Pride",
      description: "Represent Zimbabwe in 5 tournaments",
      icon: "🇿🇼",
      type: "PARTICIPATION",
      requirements: { tournamentsJoined: 5 },
      points: 300,
    },
    {
      name: "Rising Star",
      description: "Reach 1500 rating",
      icon: "⭐",
      type: "RATING_MILESTONE",
      requirements: { rating: 1500 },
      points: 400,
    },
  ];

  await prisma.achievement.createMany({
    data: achievements,
  });

  // 8. Create game statistics for users
  console.log("📊 Creating game statistics...");
  const gameStats = [];
  for (const user of createdUsers.slice(0, 3)) {
    // Skip admin user
    for (const game of createdGames) {
      const gamesPlayed = Math.floor(Math.random() * 20) + 5;
      const gamesWon = Math.floor(gamesPlayed * (0.3 + Math.random() * 0.4));
      const gamesLost = gamesPlayed - gamesWon;

      gameStats.push({
        userId: user.id,
        gameId: game.id,
        gamesPlayed,
        gamesWon,
        gamesLost,
        gamesDrawn: 0,
        winRate: gamesWon / gamesPlayed,
        averageScore: Math.floor(Math.random() * 100) + 50,
        bestScore: Math.floor(Math.random() * 200) + 100,
        totalPlayTime: gamesPlayed * (game.averageTimeMs / 1000),
        currentRating: Math.floor(Math.random() * 400) + 1000,
        peakRating: Math.floor(Math.random() * 600) + 1200,
      });
    }
  }

  await prisma.gameStatistic.createMany({
    data: gameStats,
  });

  console.log("✅ Zimbabwe gaming platform seeded successfully!");
  console.log(`📈 Created:`);
  console.log(`   - ${locations.length} Zimbabwe locations`);
  console.log(`   - ${institutions.length} institutions`);
  console.log(`   - ${mobileMoneyProviders.length} mobile money providers`);
  console.log(`   - ${games.length} games`);
  console.log(`   - ${users.length} users`);
  console.log(`   - ${tournaments.length} tournaments`);
  console.log(`   - ${achievements.length} achievements`);
  console.log(`   - ${gameStats.length} game statistics records`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
