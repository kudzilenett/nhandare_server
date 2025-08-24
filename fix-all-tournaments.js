const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function fixAllTournaments() {
  try {
    console.log("🔧 Fixing all tournaments with TBD bracket issues...");

    // Find all tournaments with TBD issues
    const tournaments = await prisma.tournament.findMany({
      where: {
        status: "ACTIVE",
        players: {
          some: {},
        },
      },
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

    console.log(
      `📊 Found ${tournaments.length} active tournaments with players\n`
    );

    let fixedCount = 0;

    for (const tournament of tournaments) {
      console.log(`🔧 Processing: ${tournament.title}`);
      console.log(`   ID: ${tournament.id}`);
      console.log(`   Players: ${tournament.players.length}`);
      console.log(`   Bracket Type: ${tournament.bracketType}`);

      // Check if this tournament needs fixing
      let needsFixing = false;
      if (tournament.bracket && tournament.bracket.rounds) {
        const firstRound = tournament.bracket.rounds.find((r) => r.round === 1);
        if (firstRound && firstRound.matches) {
          needsFixing = firstRound.matches.some(
            (m) => !m.player1Id || !m.player2Id
          );
        }
      }

      if (!needsFixing) {
        console.log(`   ✅ Already fixed, skipping...\n`);
        continue;
      }

      console.log(`   🚨 Needs fixing, processing...`);

      try {
        // Clear existing matches
        await prisma.match.deleteMany({
          where: { tournamentId: tournament.id },
        });

        // Clear existing bracket
        await prisma.tournament.update({
          where: { id: tournament.id },
          data: { bracket: null },
        });

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
        await prisma.tournament.update({
          where: { id: tournament.id },
          data: { bracket: bracket },
        });

        // Create first round matches in the database
        const matches = [];

        for (const match of firstRoundMatches) {
          if (match.player1Id || match.player2Id) {
            matches.push({
              player1Id: match.player1Id,
              player2Id: match.player2Id,
              gameId: tournament.gameId,
              tournamentId: tournament.id,
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
          console.log(`   ✅ Created ${matches.length} first round matches`);
        }

        fixedCount++;
        console.log(`   ✅ Fixed successfully!\n`);
      } catch (error) {
        console.error(`   ❌ Error fixing tournament:`, error.message);
        console.log("");
      }
    }

    console.log(
      `🎉 Fixed ${fixedCount} out of ${tournaments.length} tournaments!`
    );
  } catch (error) {
    console.error("❌ Error fixing tournaments:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllTournaments();
