const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkBracketDB() {
  try {
    console.log("🔍 Checking bracket data in database...");

    const tournamentId = "cmeo3vpii004hj0i8230utnfe";

    // Check tournament data
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        title: true,
        bracketType: true,
        bracket: true,
        _count: {
          select: { players: true, matches: true },
        },
      },
    });

    if (!tournament) {
      console.log("❌ Tournament not found");
      return;
    }

    console.log(`📊 Tournament: ${tournament.title}`);
    console.log(`📋 Bracket Type: ${tournament.bracketType}`);
    console.log(`👥 Players: ${tournament._count.players}`);
    console.log(`🎮 Matches: ${tournament._count.matches}`);

    if (tournament.bracket) {
      console.log("\n✅ Tournament has bracket data:");
      console.log(`   Type: ${tournament.bracket.type}`);
      console.log(`   Rounds: ${tournament.bracket.totalRounds}`);
      console.log(`   Total Matches: ${tournament.bracket.totalMatches}`);
      console.log(`   Players: ${tournament.bracket.players?.length || 0}`);

      if (tournament.bracket.rounds) {
        console.log(`\n📋 Rounds: ${tournament.bracket.rounds.length}`);
        tournament.bracket.rounds.forEach((round, roundIndex) => {
          console.log(
            `\n🔄 Round ${round.round} (${round.matches?.length || 0} matches):`
          );
          if (round.matches) {
            round.matches.forEach((match, matchIndex) => {
              console.log(`   Match ${matchIndex + 1}:`);
              console.log(
                `     Player 1: ${
                  match.player1Id ? "✅ Set" : "❌ TBD"
                } (Seed: ${match.player1Seed})`
              );
              console.log(
                `     Player 2: ${
                  match.player2Id ? "✅ Set" : "❌ TBD"
                } (Seed: ${match.player2Seed})`
              );
              console.log(`     Status: ${match.status}`);
              console.log(`     Is Bye: ${match.isBye}`);
            });
          }
        });
      }
    } else {
      console.log("\n❌ Tournament has no bracket data");
    }

    // Check matches
    const matches = await prisma.match.findMany({
      where: { tournamentId },
      select: {
        id: true,
        round: true,
        status: true,
        player1Id: true,
        player2Id: true,
        player1: { select: { username: true } },
        player2: { select: { username: true } },
      },
      orderBy: [{ round: "asc" }, { id: "asc" }],
    });

    if (matches.length > 0) {
      console.log(`\n🎮 Database Matches (${matches.length}):`);
      matches.forEach((match, index) => {
        console.log(
          `   Match ${index + 1} (Round ${match.round}): ${
            match.player1?.username || "TBD"
          } vs ${match.player2?.username || "TBD"} [${match.status}]`
        );
      });
    } else {
      console.log("\n❌ No matches found in database");
    }

    console.log("\n🎉 Database check completed!");
  } catch (error) {
    console.error("❌ Error checking database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBracketDB();
