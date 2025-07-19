import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixWinRateFormat() {
  console.log("🔧 Starting win rate format fix...");

  try {
    // Fix User table win rates
    console.log("📊 Fixing User table win rates...");
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { winRate: { gt: 1 } }, // Already in percentage format
          { winRate: { gte: 0, lte: 1 } }, // In decimal format
        ],
      },
      select: {
        id: true,
        username: true,
        winRate: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    });

    let userUpdatedCount = 0;
    for (const user of users) {
      // If win rate is in decimal format (0.0-1.0), convert to percentage
      if (user.winRate >= 0 && user.winRate <= 1 && user.winRate !== 0) {
        const newWinRate = user.winRate * 100;
        await prisma.user.update({
          where: { id: user.id },
          data: { winRate: newWinRate },
        });
        console.log(
          `✅ Fixed user ${user.username}: ${user.winRate} → ${newWinRate}%`
        );
        userUpdatedCount++;
      } else if (user.winRate > 1) {
        console.log(
          `ℹ️  User ${user.username}: Already in percentage format (${user.winRate}%)`
        );
      } else {
        console.log(
          `ℹ️  User ${user.username}: No games played (${user.winRate}%)`
        );
      }
    }

    // Fix GameStatistic table win rates
    console.log("\n📊 Fixing GameStatistic table win rates...");
    const gameStats = await prisma.gameStatistic.findMany({
      where: {
        OR: [
          { winRate: { gt: 1 } }, // Already in percentage format
          { winRate: { gte: 0, lte: 1 } }, // In decimal format
        ],
      },
      select: {
        id: true,
        userId: true,
        gameId: true,
        winRate: true,
        gamesPlayed: true,
        gamesWon: true,
        user: {
          select: { username: true },
        },
        game: {
          select: { name: true },
        },
      },
    });

    let gameStatUpdatedCount = 0;
    for (const stat of gameStats) {
      // If win rate is in decimal format (0.0-1.0), convert to percentage
      if (stat.winRate >= 0 && stat.winRate <= 1 && stat.winRate !== 0) {
        const newWinRate = stat.winRate * 100;
        await prisma.gameStatistic.update({
          where: { id: stat.id },
          data: { winRate: newWinRate },
        });
        console.log(
          `✅ Fixed game stat for ${stat.user.username} (${stat.game.name}): ${stat.winRate} → ${newWinRate}%`
        );
        gameStatUpdatedCount++;
      } else if (stat.winRate > 1) {
        console.log(
          `ℹ️  Game stat for ${stat.user.username} (${stat.game.name}): Already in percentage format (${stat.winRate}%)`
        );
      } else {
        console.log(
          `ℹ️  Game stat for ${stat.user.username} (${stat.game.name}): No games played (${stat.winRate}%)`
        );
      }
    }

    console.log("\n🎉 Win rate format fix completed!");
    console.log(`📈 Users updated: ${userUpdatedCount}`);
    console.log(`📈 Game statistics updated: ${gameStatUpdatedCount}`);

    // Verify the fix
    console.log("\n🔍 Verifying fix...");
    const decimalUsers = await prisma.user.count({
      where: {
        winRate: { gte: 0, lte: 1, not: 0 },
      },
    });

    const decimalGameStats = await prisma.gameStatistic.count({
      where: {
        winRate: { gte: 0, lte: 1, not: 0 },
      },
    });

    if (decimalUsers === 0 && decimalGameStats === 0) {
      console.log("✅ All win rates are now in percentage format!");
    } else {
      console.log(
        `⚠️  Warning: ${decimalUsers} users and ${decimalGameStats} game stats still in decimal format`
      );
    }
  } catch (error) {
    console.error("💥 Script failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixWinRateFormat();
