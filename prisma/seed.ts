import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create games
  const games = await Promise.all([
    prisma.game.create({
      data: {
        name: "Chess",
        description: "Strategic board game",
        emoji: "♟️",
        minPlayers: 2,
        maxPlayers: 2,
        averageTimeMs: 900000, // 15 minutes
        rules: {
          type: "standard",
          timeControl: "15+10",
        },
        settings: {
          allowUndo: false,
          showHints: true,
        },
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
        rules: {
          type: "american",
          forcedCapture: true,
        },
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
        rules: {
          type: "standard",
          boardSize: "7x6",
        },
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
        rules: {
          type: "standard",
          boardSize: "3x3",
        },
      },
    }),
  ]);

  console.log(
    "Created games:",
    games.map((g) => g.name)
  );

  // Create test users
  const hashedPassword = await bcrypt.hash("password123", 12);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: "chess.master@example.com",
        username: "ChessMaster2024",
        password: hashedPassword,
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
        password: hashedPassword,
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
        password: hashedPassword,
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

  console.log(
    "Created users:",
    users.map((u) => u.username)
  );

  // Create game statistics for users
  for (const user of users) {
    for (const game of games) {
      await prisma.gameStatistic.create({
        data: {
          userId: user.id,
          gameId: game.id,
          gamesPlayed: Math.floor(Math.random() * 50) + 10,
          gamesWon: Math.floor(Math.random() * 30) + 5,
          gamesLost: Math.floor(Math.random() * 20) + 3,
          gamesDrawn: Math.floor(Math.random() * 5),
          currentRating: 1200 + Math.floor(Math.random() * 800),
          peakRating: 1400 + Math.floor(Math.random() * 800),
        },
      });
    }
  }

  // Create sample tournaments
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
        gameId: games.find((g) => g.name === "Chess")!.id,
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
        gameId: games.find((g) => g.name === "Chess")!.id,
        bracketType: "SINGLE_ELIMINATION",
      },
    }),
  ]);

  console.log(
    "Created tournaments:",
    tournaments.map((t) => t.title)
  );

  // Register users for tournaments
  await prisma.tournamentPlayer.create({
    data: {
      userId: users[0].id,
      tournamentId: tournaments[0].id,
      seedNumber: 1,
    },
  });

  await prisma.tournamentPlayer.create({
    data: {
      userId: users[2].id,
      tournamentId: tournaments[1].id,
      seedNumber: 1,
    },
  });

  // Create achievements
  const achievements = await Promise.all([
    prisma.achievement.create({
      data: {
        name: "First Victory",
        description: "Win your first game",
        icon: "🏆",
        type: "GAMES_WON",
        requirements: { gamesWon: 1 },
        points: 10,
      },
    }),
    prisma.achievement.create({
      data: {
        name: "Chess Master",
        description: "Win 50 chess games",
        icon: "♟️",
        type: "GAMES_WON",
        requirements: { gamesWon: 50, gameType: "chess" },
        points: 100,
      },
    }),
    prisma.achievement.create({
      data: {
        name: "Tournament Champion",
        description: "Win a tournament",
        icon: "👑",
        type: "TOURNAMENTS_WON",
        requirements: { tournamentsWon: 1 },
        points: 200,
      },
    }),
  ]);

  console.log(
    "Created achievements:",
    achievements.map((a) => a.name)
  );

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
