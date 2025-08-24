const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkAllTournaments() {
  try {
    console.log("🔍 Checking all tournaments for bracket issues...");

    const tournaments = await prisma.tournament.findMany({
      where: {
        status: "ACTIVE",
        players: {
          some: {},
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        bracketType: true,
        bracket: true,
        _count: {
          select: { players: true, matches: true },
        },
      },
    });

    console.log(
      `📊 Found ${tournaments.length} active tournaments with players\n`
    );

    tournaments.forEach((tournament, index) => {
      console.log(`${index + 1}. ${tournament.title}`);
      console.log(`   ID: ${tournament.id}`);
      console.log(`   Status: ${tournament.status}`);
      console.log(`   Bracket Type: ${tournament.bracketType}`);
      console.log(`   Players: ${tournament._count.players}`);
      console.log(`   Matches: ${tournament._count.matches}`);

      if (tournament.bracket) {
        console.log(
          `   ✅ Has bracket: ${tournament.bracket.type} (${tournament.bracket.totalRounds} rounds)`
        );

        // Check first round
        const firstRound = tournament.bracket.rounds?.find(
          (r) => r.round === 1
        );
        if (firstRound && firstRound.matches) {
          const tbdMatches = firstRound.matches.filter(
            (m) => !m.player1Id || !m.player2Id
          );
          const validMatches = firstRound.matches.filter(
            (m) => m.player1Id && m.player2Id
          );
          console.log(
            `   🎯 First Round: ${validMatches.length} valid, ${tbdMatches.length} TBD matches`
          );
        }
      } else {
        console.log(`   ❌ No bracket`);
      }
      console.log("");
    });

    // Find the tournament with TBD issues
    const tbdTournament = tournaments.find((t) => {
      if (!t.bracket) return false;
      const firstRound = t.bracket.rounds?.find((r) => r.round === 1);
      if (!firstRound || !firstRound.matches) return false;
      return firstRound.matches.some((m) => !m.player1Id || !m.player2Id);
    });

    if (tbdTournament) {
      console.log(
        `🚨 Tournament with TBD issues found: ${tbdTournament.title}`
      );
      console.log(`   This is the one that needs fixing!`);
    } else {
      console.log("✅ All tournaments have proper brackets!");
    }

    console.log("\n🎉 Tournament check completed!");
  } catch (error) {
    console.error("❌ Error checking tournaments:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllTournaments();
