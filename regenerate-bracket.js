const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function regenerateBracket() {
  try {
    console.log("🔄 Regenerating tournament bracket...");

    const tournamentId = "cmeo3vpii004hj0i8230utnfe";

    // Get tournament with players
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        players: {
          include: {
            user: {
              include: {
                gameStats: true,
              },
            },
          },
          orderBy: { registeredAt: "asc" },
        },
        game: true,
      },
    });

    if (!tournament) {
      console.log("❌ Tournament not found");
      return;
    }

    console.log(`📊 Tournament: ${tournament.title}`);
    console.log(`👥 Players: ${tournament.players.length}`);
    console.log(`🎮 Game: ${tournament.game?.name}`);
    console.log(`📋 Bracket Type: ${tournament.bracketType}`);

    // Clear existing matches
    console.log("🧹 Clearing existing matches...");
    await prisma.match.deleteMany({
      where: { tournamentId },
    });

    // Clear existing bracket
    console.log("🧹 Clearing existing bracket...");
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { bracket: null },
    });

    // Generate new bracket using the service
    console.log("🔧 Generating new bracket...");

    // Import the service dynamically
    const {
      BracketGenerationService,
    } = require("./src/services/BracketGenerationService.ts");

    const bracket = await BracketGenerationService.generateBracket(
      tournamentId
    );

    console.log("✅ Bracket generated successfully!");
    console.log(`📋 Type: ${bracket.type}`);
    console.log(`🔄 Rounds: ${bracket.totalRounds}`);
    console.log(`⚔️ Total Matches: ${bracket.totalMatches}`);
    console.log(`👥 Players: ${bracket.players.length}`);

    // Check first round
    const firstRound = bracket.rounds.find((r) => r.round === 1);
    if (firstRound) {
      console.log(`\n🎯 First Round (${firstRound.matches.length} matches):`);
      firstRound.matches.forEach((match, index) => {
        console.log(`  Match ${index + 1}:`);
        console.log(
          `    Player 1: ${match.player1Id ? "✅ Set" : "❌ TBD"} (Seed: ${
            match.player1Seed
          })`
        );
        console.log(
          `    Player 2: ${match.player2Id ? "✅ Set" : "❌ TBD"} (Seed: ${
            match.player2Seed
          })`
        );
        console.log(`    Status: ${match.status}`);
        console.log(`    Is Bye: ${match.isBye}`);
      });
    }

    // Verify matches were created
    const matches = await prisma.match.findMany({
      where: { tournamentId },
      include: {
        player1: { select: { username: true } },
        player2: { select: { username: true } },
      },
    });

    console.log(`\n🎮 Database matches created: ${matches.length}`);
    matches.forEach((match, index) => {
      console.log(
        `  Match ${index + 1}: ${match.player1?.username || "TBD"} vs ${
          match.player2?.username || "TBD"
        }`
      );
    });

    console.log("\n🎉 Bracket regeneration completed!");
  } catch (error) {
    console.error("❌ Error regenerating bracket:", error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateBracket();
