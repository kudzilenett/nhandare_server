const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  try {
    // Create games
    console.log("Creating games...");
    const games = await Promise.all([
      prisma.game.create({
        data: {
          name: "Chess",
          description: "Strategic board game",
          emoji: "♟️",
          minPlayers: 2,
          maxPlayers: 2,
          averageTimeMs: 900000, // 15 minutes
        },
      }),
      prisma.game.create({
        data: {
          name: "Checkers",
          description: "Classic board game",
          emoji: "🔴",
          minPlayers: 2,
          maxPlayers: 2,
          averageTimeMs: 600000, // 10 minutes
        },
      }),
      prisma.game.create({
        data: {
          name: "Connect 4",
          description: "Four in a row",
          emoji: "🔵",
          minPlayers: 2,
          maxPlayers: 2,
          averageTimeMs: 300000, // 5 minutes
        },
      }),
      prisma.game.create({
        data: {
          name: "Tic-Tac-Toe",
          description: "Quick matches",
          emoji: "❌",
          minPlayers: 2,
          maxPlayers: 2,
          averageTimeMs: 120000, // 2 minutes
        },
      }),
    ]);

    console.log(`✅ Created ${games.length} games`);

    // Create test users
    console.log("Creating test users...");
    const users = await Promise.all([
      prisma.user.create({
        data: {
          email: "chess.master@example.com",
          username: "ChessMaster2024",
          password: "password123", // In production, this should be hashed
          firstName: "Magnus",
          lastName: "Chess",
          location: "New York, NY",
          points: 2450,
          rank: 1,
          gamesPlayed: 156,
          gamesWon: 132,
          winRate: 0.846,
        },
      }),
      prisma.user.create({
        data: {
          email: "game.pro@example.com",
          username: "GameProX",
          password: "password123",
          firstName: "Alex",
          lastName: "Player",
          location: "New York, NY",
          points: 2280,
          rank: 2,
          gamesPlayed: 89,
          gamesWon: 67,
          winRate: 0.753,
        },
      }),
      prisma.user.create({
        data: {
          email: "strategy.king@example.com",
          username: "StrategyKing",
          password: "password123",
          firstName: "Sarah",
          lastName: "Strategy",
          location: "New York, NY",
          points: 2150,
          rank: 3,
          gamesPlayed: 203,
          gamesWon: 145,
          winRate: 0.714,
        },
      }),
    ]);

    console.log(`✅ Created ${users.length} users`);

    // Create sample tournaments
    console.log("Creating tournaments...");
    const tournaments = await Promise.all([
      prisma.tournament.create({
        data: {
          title: "Local Chess Championship",
          description: "Weekly chess tournament for local players",
          prizePool: 500,
          entryFee: 10,
          maxPlayers: 32,
          currentPlayers: 24,
          status: "ACTIVE",
          registrationStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          registrationEnd: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          startDate: new Date(),
          endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          location: "New York, NY",
          gameId: games.find((g) => g.name === "Chess").id,
          bracketType: "SINGLE_ELIMINATION",
        },
      }),
      prisma.tournament.create({
        data: {
          title: "Weekly Mixed Games",
          description: "Tournament featuring multiple games",
          prizePool: 200,
          entryFee: 5,
          maxPlayers: 16,
          currentPlayers: 8,
          status: "OPEN",
          registrationStart: new Date(),
          registrationEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          startDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          location: "New York, NY",
          gameId: games.find((g) => g.name === "Connect 4").id,
          bracketType: "SINGLE_ELIMINATION",
        },
      }),
    ]);

    console.log(`✅ Created ${tournaments.length} tournaments`);

    // Create sample chat messages for first tournament
    console.log("Creating tournament chat messages...");
    await prisma.tournamentChatMessage.createMany({
      data: [
        {
          tournamentId: tournaments[0].id,
          userId: users[0].id,
          text: "Good luck everyone!",
          createdAt: new Date(Date.now() - 3600 * 1000),
        },
        {
          tournamentId: tournaments[0].id,
          userId: users[1].id,
          text: "May the best player win.",
          createdAt: new Date(Date.now() - 3500 * 1000),
        },
      ],
    });

    console.log("✅ Seeded chat messages");

    console.log("🎉 Database seeded successfully!");
    console.log("\n📊 Summary:");
    console.log(`   Games: ${games.length}`);
    console.log(`   Users: ${users.length}`);
    console.log(`   Tournaments: ${tournaments.length}`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
