import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function recalculateUserStats(userId: string) {
  const gameStats = await prisma.gameStatistic.findMany({
    where: { userId },
    select: {
      gamesPlayed: true,
      gamesWon: true,
      gamesLost: true,
      gamesDrawn: true,
    },
  });

  const totalStats = gameStats.reduce(
    (acc, stat) => {
      acc.gamesPlayed += stat.gamesPlayed;
      acc.gamesWon += stat.gamesWon;
      acc.gamesLost += stat.gamesLost;
      acc.gamesDrawn += stat.gamesDrawn;
      return acc;
    },
    { gamesPlayed: 0, gamesWon: 0, gamesLost: 0, gamesDrawn: 0 }
  );

  const winRate =
    totalStats.gamesPlayed > 0
      ? (totalStats.gamesWon / totalStats.gamesPlayed) * 100
      : 0;

  // Update user statistics
  await prisma.user.update({
    where: { id: userId },
    data: {
      gamesPlayed: totalStats.gamesPlayed,
      gamesWon: totalStats.gamesWon,
      winRate,
    },
  });

  return totalStats;
}

async function main() {
  console.log("🔧 Starting user statistics fix...");

  try {
    // Get all active users
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        gamesPlayed: true,
        gamesWon: true,
        winRate: true,
      },
    });

    console.log(`📊 Found ${users.length} active users to process`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        const oldStats = {
          gamesPlayed: user.gamesPlayed,
          gamesWon: user.gamesWon,
          winRate: user.winRate,
        };

        const newStats = await recalculateUserStats(user.id);

        const hasChanged =
          oldStats.gamesPlayed !== newStats.gamesPlayed ||
          oldStats.gamesWon !== newStats.gamesWon ||
          Math.abs(
            oldStats.winRate - newStats.gamesWon / newStats.gamesPlayed
          ) > 0.001;

        if (hasChanged) {
          console.log(
            `✅ Fixed ${user.username}: ${oldStats.gamesPlayed}/${oldStats.gamesWon} → ${newStats.gamesPlayed}/${newStats.gamesWon}`
          );
          updatedCount++;
        } else {
          console.log(
            `ℹ️  ${user.username}: Already correct (${newStats.gamesPlayed}/${newStats.gamesWon})`
          );
        }
      } catch (error) {
        console.error(`❌ Failed to fix ${user.username}:`, error);
        errorCount++;
      }
    }

    console.log("\n🎉 User statistics fix completed!");
    console.log(`📈 Updated: ${updatedCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
  } catch (error) {
    console.error("💥 Script failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
