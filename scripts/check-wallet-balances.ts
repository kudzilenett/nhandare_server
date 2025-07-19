import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function calculateWalletBalance(userId: string): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: {
      userId,
      status: {
        in: ["COMPLETED", "REFUNDED", "PROCESSING", "PENDING"],
      },
    },
  });

  let balance = 0;
  payments.forEach((p) => {
    if (p.type === "PRIZE_PAYOUT" && p.status === "COMPLETED") {
      balance += p.amount;
    } else if (p.type === "WITHDRAWAL") {
      balance -= p.amount;
    } else if (p.type === "ENTRY_FEE" && p.status === "COMPLETED") {
      balance -= p.amount;
    }
  });

  // Round to 2 decimal places to avoid floating point precision issues
  return Math.round(balance * 100) / 100;
}

async function main() {
  console.log("💰 Checking wallet balances for all users...");

  try {
    // Get all active users
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        points: true,
      },
      orderBy: { username: "asc" },
    });

    console.log(`📊 Found ${users.length} active users to check\n`);

    let totalWalletBalance = 0;
    let usersWithPayments = 0;

    for (const user of users) {
      try {
        const walletBalance = await calculateWalletBalance(user.id);
        totalWalletBalance += walletBalance;

        if (walletBalance !== 0) {
          usersWithPayments++;
        }

        const status =
          walletBalance > 0 ? "💰" : walletBalance < 0 ? "💸" : "⚪";
        console.log(
          `${status} ${user.username.padEnd(25)} | Points: ${user.points
            .toString()
            .padStart(4)} | Wallet: $${walletBalance.toFixed(2)}`
        );
      } catch (error) {
        console.error(`❌ Failed to check ${user.username}:`, error);
      }
    }

    console.log("\n📈 Summary:");
    console.log(`👥 Total users: ${users.length}`);
    console.log(`💰 Users with wallet activity: ${usersWithPayments}`);
    console.log(
      `💵 Total wallet balance across all users: $${totalWalletBalance.toFixed(
        2
      )}`
    );
  } catch (error) {
    console.error("💥 Script failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
