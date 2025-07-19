import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkUserPayments(username: string) {
  console.log(`💰 Checking payments for user: ${username}`);

  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, points: true },
    });

    if (!user) {
      console.log("❌ User not found");
      return;
    }

    console.log(`👤 User: ${user.username} (Points: ${user.points})`);
    console.log("");

    // Get all payments for this user
    const payments = await prisma.payment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    if (payments.length === 0) {
      console.log("📭 No payments found for this user");
      return;
    }

    console.log("📋 Payment History:");
    console.log("─".repeat(80));

    let runningBalance = 0;

    payments.forEach((payment, index) => {
      const amount = payment.amount;
      const type = payment.type;
      const status = payment.status;

      // Calculate balance change
      let balanceChange = 0;
      if (type === "PRIZE_PAYOUT" && status === "COMPLETED") {
        balanceChange = amount;
        runningBalance += amount;
      } else if (type === "WITHDRAWAL") {
        balanceChange = -amount;
        runningBalance -= amount;
      } else if (type === "ENTRY_FEE" && status === "COMPLETED") {
        balanceChange = -amount;
        runningBalance -= amount;
      }

      const changeSymbol = balanceChange > 0 ? "+" : "";
      const date = payment.createdAt.toISOString().split("T")[0];

      console.log(
        `${(index + 1).toString().padStart(2)}. ${date} | ${type.padEnd(
          12
        )} | ${status.padEnd(10)} | ${changeSymbol}$${balanceChange
          .toFixed(2)
          .padStart(8)} | Balance: $${runningBalance.toFixed(2)}`
      );
    });

    console.log("─".repeat(80));
    console.log(`💵 Final Wallet Balance: $${runningBalance.toFixed(2)}`);
  } catch (error) {
    console.error("💥 Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get username from command line argument
const username = process.argv[2];
if (!username) {
  console.log("Usage: npx ts-node scripts/check-user-payments.ts <username>");
  process.exit(1);
}

checkUserPayments(username);
