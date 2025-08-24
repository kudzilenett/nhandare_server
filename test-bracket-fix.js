const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function testBracketFix() {
  try {
    console.log("🔍 Testing tournament bracket display...");

    // Find a tournament with players
    const tournament = await prisma.tournament.findFirst({
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
        },
        matches: true,
      },
    });

    if (!tournament) {
      console.log("❌ No active tournament with players found");
      return;
    }

    console.log(`📊 Found tournament: ${tournament.title}`);
    console.log(`🆔 Tournament ID: ${tournament.id}`);
    console.log(`👥 Players: ${tournament.players.length}`);
    console.log(`🎮 Matches: ${tournament.matches.length}`);

    // Check if tournament has a bracket structure
    if (tournament.bracket) {
      console.log("✅ Tournament has bracket structure");
      console.log(`📋 Bracket type: ${tournament.bracket.type}`);
      console.log(`🔄 Rounds: ${tournament.bracket.totalRounds}`);
      console.log(`⚔️ Total matches: ${tournament.bracket.totalMatches}`);

      // Check first round
      const firstRound = tournament.bracket.rounds?.find((r) => r.round === 1);
      if (firstRound) {
        console.log(`\n🎯 First Round (${firstRound.matches.length} matches):`);
        firstRound.matches.forEach((match, index) => {
          console.log(`  Match ${index + 1}:`);
          console.log(
            `    Player 1: ${match.player1Id ? "✅ Set" : "❌ TBD"} (${
              match.player1Seed
            })`
          );
          console.log(
            `    Player 2: ${match.player2Id ? "✅ Set" : "❌ TBD"} (${
              match.player2Seed
            })`
          );
          console.log(`    Status: ${match.status}`);
          console.log(`    Is Bye: ${match.isBye}`);
        });
      }
    } else {
      console.log("❌ Tournament has no bracket structure");
    }

    // Test bracket endpoint population
    console.log("\n🔧 Testing bracket endpoint population...");

    // Simulate the bracket population logic
    if (tournament.bracket && tournament.matches) {
      const bracket = tournament.bracket;

      if (bracket.rounds && Array.isArray(bracket.rounds)) {
        bracket.rounds.forEach((round) => {
          if (round.matches && Array.isArray(round.matches)) {
            round.matches.forEach((bracketMatch) => {
              if (round.round === 1) {
                // For first round, populate from bracket data and add player info
                if (bracketMatch.player1Id) {
                  const player1 = tournament.players.find(
                    (p) => p.user.id === bracketMatch.player1Id
                  );
                  if (player1) {
                    bracketMatch.player1Info = {
                      id: player1.user.id,
                      username: player1.user.username,
                      avatar: player1.user.avatar,
                    };
                    console.log(
                      `✅ Populated Player 1: ${player1.user.username}`
                    );
                  }
                }

                if (bracketMatch.player2Id) {
                  const player2 = tournament.players.find(
                    (p) => p.user.id === bracketMatch.player2Id
                  );
                  if (player2) {
                    bracketMatch.player2Info = {
                      id: player2.user.id,
                      username: player2.user.username,
                      avatar: player2.user.avatar,
                    };
                    console.log(
                      `✅ Populated Player 2: ${player2.user.username}`
                    );
                  }
                }
              }
            });
          }
        });
      }
    }

    console.log("\n🎉 Bracket test completed!");

    // Show recommendation
    if (tournament.bracket && tournament.bracket.rounds) {
      const firstRound = tournament.bracket.rounds.find((r) => r.round === 1);
      if (
        firstRound &&
        firstRound.matches.some((m) => !m.player1Id || !m.player2Id)
      ) {
        console.log(`\n🚨 This tournament needs bracket fixing!`);
        console.log(`   Run: node fix-bracket-direct.js ${tournament.id}`);
      } else {
        console.log(`\n✅ This tournament's bracket looks good!`);
      }
    }
  } catch (error) {
    console.error("❌ Error testing bracket:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testBracketFix();
