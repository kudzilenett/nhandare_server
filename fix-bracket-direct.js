const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function fixBracketDirect() {
  try {
    console.log("🔧 Fixing bracket structure directly...");

    // Fix the tournament that the test script is actually looking at
    const tournamentId = "cmeo3vpi30049j0i8geoeg1i9";

    // Get tournament with players
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
          orderBy: { registeredAt: "asc" },
        },
      },
    });

    if (!tournament) {
      console.log("❌ Tournament not found");
      return;
    }

    console.log(`📊 Tournament: ${tournament.title}`);
    console.log(`👥 Players: ${tournament.players.length}`);
    console.log(`📋 Bracket Type: ${tournament.bracketType}`);

    // Create a proper bracket structure
    const totalPlayers = tournament.players.length;
    const rounds = Math.ceil(Math.log2(totalPlayers));
    const totalMatches = totalPlayers - 1;

    // Create seeded players
    const seededPlayers = tournament.players.map((player, index) => ({
      userId: player.user.id,
      seedNumber: index + 1,
      rating: 1200, // Default rating
      registeredAt: player.registeredAt,
    }));

    // Sort by seed number
    seededPlayers.sort((a, b) => a.seedNumber - b.seedNumber);

    // Generate first round matches with proper seeding
    const firstRoundMatches = [];
    for (let i = 0; i < Math.ceil(totalPlayers / 2); i++) {
      const player1Index = i;
      const player2Index = totalPlayers - 1 - i;

      const player1 = seededPlayers[player1Index] || null;
      const player2 = seededPlayers[player2Index] || null;

      const isBye = !player1 || !player2;

      firstRoundMatches.push({
        player1Seed: player1?.seedNumber || "BYE",
        player2Seed: player2?.seedNumber || "BYE",
        player1Id: player1?.userId || null,
        player2Id: player2?.userId || null,
        matchNumber: i + 1,
        round: 1,
        isBye,
        status: isBye ? "WAITING" : "PENDING",
        winnerId: isBye ? player1?.userId || player2?.userId || null : null,
        nextMatchId: null,
      });
    }

    // Generate subsequent rounds (TBD matches)
    const roundsArray = [];
    roundsArray.push({
      round: 1,
      matches: firstRoundMatches,
    });

    for (let round = 2; round <= rounds; round++) {
      const matchesInRound = Math.ceil(totalPlayers / Math.pow(2, round));
      const roundMatches = [];

      for (let i = 0; i < matchesInRound; i++) {
        roundMatches.push({
          player1Seed: "TBD",
          player2Seed: "TBD",
          player1Id: null,
          player2Id: null,
          matchNumber: i + 1,
          round,
          isBye: false,
          status: "PENDING",
          winnerId: null,
          nextMatchId: null,
        });
      }

      roundsArray.push({
        round,
        matches: roundMatches,
      });
    }

    // Create the bracket structure
    const bracket = {
      type: tournament.bracketType || "SINGLE_ELIMINATION",
      rounds: roundsArray,
      totalRounds: rounds,
      totalMatches,
      players: seededPlayers,
      generatedAt: new Date(),
    };

    // Update the tournament with the new bracket
    console.log("💾 Updating tournament bracket...");
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { bracket: bracket },
    });

    // Create first round matches in the database
    console.log("🎮 Creating first round matches...");
    const matches = [];

    for (const match of firstRoundMatches) {
      if (match.player1Id || match.player2Id) {
        matches.push({
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          gameId: tournament.gameId,
          tournamentId,
          round: 1,
          status: match.isBye ? "WAITING" : "PENDING",
          result: "PENDING",
        });
      }
    }

    if (matches.length > 0) {
      await prisma.match.createMany({
        data: matches,
      });
      console.log(`✅ Created ${matches.length} first round matches`);
    }

    console.log("✅ Bracket structure fixed!");

    // Verify the fix
    const updatedTournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        bracket: true,
        matches: {
          include: {
            player1: { select: { username: true } },
            player2: { select: { username: true } },
          },
        },
      },
    });

    if (updatedTournament.bracket) {
      const firstRound = updatedTournament.bracket.rounds.find(
        (r) => r.round === 1
      );
      if (firstRound) {
        console.log(`\n🎯 First Round (${firstRound.matches.length} matches):`);
        firstRound.matches.forEach((match, index) => {
          const player1 = tournament.players.find(
            (p) => p.user.id === match.player1Id
          );
          const player2 = tournament.players.find(
            (p) => p.user.id === match.player2Id
          );
          console.log(
            `  Match ${index + 1}: ${player1?.user.username || "BYE"} vs ${
              player2?.user.username || "BYE"
            }`
          );
        });
      }
    }

    console.log("\n🎉 Bracket fix completed successfully!");
  } catch (error) {
    console.error("❌ Error fixing bracket:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixBracketDirect();
