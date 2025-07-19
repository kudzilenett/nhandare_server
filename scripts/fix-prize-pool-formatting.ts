import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Utility function for rounding to cents
function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

async function fixPrizePoolFormatting() {
  console.log("🔧 Fixing prize pool formatting for existing tournaments...");

  try {
    // Get all tournaments
    const tournaments = await prisma.tournament.findMany({
      select: {
        id: true,
        title: true,
        prizePool: true,
        entryFee: true,
        prizeBreakdown: true,
      },
    });

    console.log(`Found ${tournaments.length} tournaments to check`);

    let updatedCount = 0;

    for (const tournament of tournaments) {
      const originalPrizePool = tournament.prizePool;
      const roundedPrizePool = roundToCents(originalPrizePool);

      // Check if rounding is needed
      if (originalPrizePool !== roundedPrizePool) {
        console.log(`Fixing tournament: ${tournament.title}`);
        console.log(`  Original prize pool: ${originalPrizePool}`);
        console.log(`  Rounded prize pool: ${roundedPrizePool}`);

        // Update prize pool
        await prisma.tournament.update({
          where: { id: tournament.id },
          data: { prizePool: roundedPrizePool },
        });

        // Update prize breakdown if it exists
        if (tournament.prizeBreakdown) {
          const breakdown = tournament.prizeBreakdown as any;
          const updatedBreakdown = {
            first: roundToCents(breakdown.first || 0),
            second: roundToCents(breakdown.second || 0),
            third: roundToCents(breakdown.third || 0),
          };

          await prisma.tournament.update({
            where: { id: tournament.id },
            data: { prizeBreakdown: updatedBreakdown },
          });

          console.log(`  Updated prize breakdown:`, updatedBreakdown);
        }

        updatedCount++;
      }
    }

    // Also fix tournament players' prize amounts
    console.log("🔧 Fixing tournament players' prize amounts...");

    const tournamentPlayers = await prisma.tournamentPlayer.findMany({
      where: {
        prizeWon: { gt: 0 },
      },
      select: {
        id: true,
        prizeWon: true,
        tournament: {
          select: {
            title: true,
          },
        },
      },
    });

    let playerUpdatedCount = 0;

    for (const player of tournamentPlayers) {
      const originalPrizeWon = player.prizeWon;
      const roundedPrizeWon = roundToCents(originalPrizeWon);

      if (originalPrizeWon !== roundedPrizeWon) {
        console.log(
          `Fixing player prize in tournament: ${player.tournament.title}`
        );
        console.log(`  Original prize won: ${originalPrizeWon}`);
        console.log(`  Rounded prize won: ${roundedPrizeWon}`);

        await prisma.tournamentPlayer.update({
          where: { id: player.id },
          data: { prizeWon: roundedPrizeWon },
        });

        playerUpdatedCount++;
      }
    }

    console.log(
      `✅ Fixed ${updatedCount} tournaments and ${playerUpdatedCount} player prizes`
    );
  } catch (error) {
    console.error("❌ Error fixing prize pool formatting:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixPrizePoolFormatting()
  .then(() => {
    console.log("🎉 Prize pool formatting fix completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
