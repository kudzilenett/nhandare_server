/// <reference types="node" />
import { PrismaClient } from "@prisma/client";
import {
  TournamentStatus,
  MatchStatus,
  MatchResult,
  PaymentStatus,
  PaymentType,
  TournamentCategory,
  BracketType,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Helper to generate realistic Zimbabwe phone numbers
function generateZimbabwePhone(): string {
  const prefixes = ["263771", "263772", "263773", "263774", "263778"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = Math.floor(Math.random() * 900000) + 100000;
  return `+${prefix}${suffix}`;
}

async function main() {
  console.log("🎯 Seeding ACTIVE chess tournament for testing...");

  // Get current date and set up tournament dates
  const now = new Date();
  const registrationStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
  const registrationEnd = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
  const startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago
  const endDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

  // Find or create chess game
  let chessGame = await prisma.game.findFirst({
    where: { name: "Chess" },
  });

  if (!chessGame) {
    console.log("♟️ Creating Chess game...");
    chessGame = await prisma.game.create({
      data: {
        name: "Chess",
        description: "The classic strategy game of kings and queens",
        emoji: "♟️",
        minPlayers: 2,
        maxPlayers: 2,
        averageTimeMs: 1800000, // 30 minutes
        isActive: true,
        rules: {
          timeControl: { initialTime: 600, increment: 5 }, // 10+5 minute games
          allowDrawOffers: true,
          allowTakebacks: false,
        },
      },
    });
  }

  // Find existing users or create test users
  let users = await prisma.user.findMany({
    take: 8, // We need at least 8 users for a proper tournament
    orderBy: { createdAt: "desc" },
  });

  // If we don't have enough users, create some test users
  const neededUsers = 8 - users.length;
  if (neededUsers > 0) {
    console.log(`👥 Creating ${neededUsers} test users...`);
    const hashedPassword = await bcrypt.hash("password123", 10);

    for (let i = 0; i < neededUsers; i++) {
      const createdUser = await prisma.user.create({
        data: {
          email: `testplayer${i + users.length + 1}@nhandare.co.zw`,
          username: `TestPlayer${i + users.length + 1}`,
          password: hashedPassword,
          firstName: `Player`,
          lastName: `${i + users.length + 1}`,
          phoneNumber: generateZimbabwePhone(),
          province: "Harare",
          city: "Harare",
          location: "Harare, Zimbabwe",
          points: Math.floor(Math.random() * 1000) + 500,
          gamesPlayed: Math.floor(Math.random() * 50) + 10,
          gamesWon: Math.floor(Math.random() * 25) + 5,
          isActive: true,
          isVerified: true,
        },
      });
      users.push(createdUser);
    }
  }

  // Create the active tournament
  console.log("🏆 Creating ACTIVE chess tournament...");
  const tournament = await prisma.tournament.create({
    data: {
      title: "Nhandare Chess Championship 2025 - LIVE",
      description:
        "🔥 ACTIVE tournament for testing! Join now and play live matches with real opponents.",
      prizePool: 500.0,
      entryFee: 25.0,
      maxPlayers: 8,
      currentPlayers: 8,
      status: TournamentStatus.ACTIVE, // ACTIVE status
      province: "Harare",
      city: "Harare",
      location: "Harare, Zimbabwe",
      isOnlineOnly: true,
      targetAudience: "public",
      category: TournamentCategory.PUBLIC,
      difficultyLevel: "intermediate",
      bracketType: BracketType.SINGLE_ELIMINATION,
      gameId: chessGame.id,
      registrationStart,
      registrationEnd,
      startDate,
      endDate,
      prizeBreakdown: {
        first: 300, // 60%
        second: 125, // 25%
        third: 75, // 15%
      },
      bracket: {
        rounds: [
          {
            roundNumber: 1,
            matches: [
              { matchIndex: 0, player1Seed: 1, player2Seed: 8 },
              { matchIndex: 1, player1Seed: 4, player2Seed: 5 },
              { matchIndex: 2, player1Seed: 2, player2Seed: 7 },
              { matchIndex: 3, player1Seed: 3, player2Seed: 6 },
            ],
          },
          {
            roundNumber: 2,
            matches: [
              { matchIndex: 0, player1Seed: "TBD", player2Seed: "TBD" },
              { matchIndex: 1, player1Seed: "TBD", player2Seed: "TBD" },
            ],
          },
          {
            roundNumber: 3,
            matches: [
              { matchIndex: 0, player1Seed: "TBD", player2Seed: "TBD" },
            ],
          },
        ],
      },
    },
  });

  // Register all users for the tournament and create payments
  console.log("✅ Registering tournament players and creating payments...");
  for (let i = 0; i < users.length; i++) {
    const registrationTime = new Date(registrationStart.getTime() + i * 60000);

    await prisma.tournamentPlayer.create({
      data: {
        userId: users[i].id,
        tournamentId: tournament.id,
        registeredAt: registrationTime,
        joinedAt: registrationTime,
        isActive: true,
        seedNumber: i + 1,
        currentRound: 1,
        isEliminated: false,
        placement: null,
        prizeWon: 0,
      },
    });

    // Create entry fee payment for this player
    await prisma.payment.create({
      data: {
        userId: users[i].id,
        tournamentId: tournament.id,
        amount: tournament.entryFee,
        currency: "USD",
        type: PaymentType.ENTRY_FEE,
        status: PaymentStatus.COMPLETED,
        paymentMethodCode: Math.random() < 0.7 ? "ECOCASH" : "ONEMONEY",
        mobileMoneyNumber: generateZimbabwePhone(),
        paymentConfirmedAt: registrationTime,
        createdAt: registrationTime,
      },
    });
  }

  // Create first round matches - SOME PENDING, SOME COMPLETED for realistic testing
  console.log("⚔️ Creating tournament matches (mix of pending/completed)...");
  const matchups = [
    [0, 7], // Seed 1 vs Seed 8
    [3, 4], // Seed 4 vs Seed 5
    [1, 6], // Seed 2 vs Seed 7
    [2, 5], // Seed 3 vs Seed 6
  ];

  const createdMatches: any[] = [];
  for (let i = 0; i < matchups.length; i++) {
    const [p1Index, p2Index] = matchups[i];
    const player1 = users[p1Index];
    const player2 = users[p2Index];

    // Make some matches completed, some pending for testing
    const isCompleted = i < 2; // First 2 matches completed, last 2 pending
    const matchStartTime = new Date(startDate.getTime() + i * 15 * 60000); // Stagger by 15 mins

    const result = isCompleted
      ? Math.random() < 0.5
        ? MatchResult.PLAYER1_WIN
        : MatchResult.PLAYER2_WIN
      : MatchResult.PENDING;

    const winnerId =
      result === MatchResult.PLAYER1_WIN
        ? player1.id
        : result === MatchResult.PLAYER2_WIN
        ? player2.id
        : null;

    const match = await prisma.match.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        gameId: chessGame.id,
        tournamentId: tournament.id,
        round: 1,
        status: isCompleted ? MatchStatus.COMPLETED : MatchStatus.PENDING,
        result,
        winnerId,
        duration: isCompleted ? Math.floor(Math.random() * 1200) + 600 : null, // 10-30 minutes
        createdAt: matchStartTime,
        startedAt: isCompleted ? matchStartTime : null,
        finishedAt: isCompleted
          ? new Date(
              matchStartTime.getTime() +
                (Math.floor(Math.random() * 1200) + 600) * 1000
            )
          : null,
        gameData: isCompleted
          ? {
              finalPosition:
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
              moves: ["e2e4", "e7e5", "g1f3", "b8c6"], // Sample moves
              gameResult: "checkmate",
            }
          : undefined,
      },
    });

    createdMatches.push(match);
  }

  // Create or update game statistics for all players
  console.log("📊 Creating/updating game statistics...");
  for (const user of users) {
    await prisma.gameStatistic.upsert({
      where: {
        userId_gameId: {
          userId: user.id,
          gameId: chessGame.id,
        },
      },
      update: {
        gamesPlayed: Math.floor(Math.random() * 50) + 10,
        gamesWon: Math.floor(Math.random() * 25) + 5,
        gamesLost: Math.floor(Math.random() * 20) + 3,
        gamesDrawn: Math.floor(Math.random() * 5),
        winRate: 0.6 + Math.random() * 0.3,
        currentRating: 1200 + Math.floor(Math.random() * 800),
        peakRating: 1400 + Math.floor(Math.random() * 600),
        totalPlayTime: Math.floor(Math.random() * 100000) + 10000,
      },
      create: {
        userId: user.id,
        gameId: chessGame.id,
        gamesPlayed: Math.floor(Math.random() * 50) + 10,
        gamesWon: Math.floor(Math.random() * 25) + 5,
        gamesLost: Math.floor(Math.random() * 20) + 3,
        gamesDrawn: Math.floor(Math.random() * 5),
        winRate: 0.6 + Math.random() * 0.3,
        currentRating: 1200 + Math.floor(Math.random() * 800),
        peakRating: 1400 + Math.floor(Math.random() * 600),
        totalPlayTime: Math.floor(Math.random() * 100000) + 10000,
      },
    });
  }

  console.log("\n🎉 ACTIVE TOURNAMENT SEEDED SUCCESSFULLY!");
  console.log("=====================================");
  console.log(`🏆 Tournament: "${tournament.title}"`);
  console.log(`📅 Status: ${tournament.status} (Currently running!)`);
  console.log(`👥 Players: ${users.length}/8 registered`);
  console.log(`⚔️ Matches: ${createdMatches.length} created`);
  console.log(
    `✅ Completed matches: ${
      createdMatches.filter((m) => m.status === MatchStatus.COMPLETED).length
    }`
  );
  console.log(
    `⏳ Pending matches: ${
      createdMatches.filter((m) => m.status === MatchStatus.PENDING).length
    }`
  );
  console.log(`💰 Prize Pool: $${tournament.prizePool}`);
  console.log(`💳 Entry Fee: $${tournament.entryFee}`);
  console.log("=====================================");
  console.log("🎯 You can now test:");
  console.log("  1. View tournament in app");
  console.log("  2. See bracket with some completed/pending matches");
  console.log("  3. Click 'Play Match' on pending matches");
  console.log("  4. Test full chess game flow");
  console.log("  5. See automatic bracket progression");
  console.log("\n✨ Ready for tournament testing!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding active tournament:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
