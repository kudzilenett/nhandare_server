import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testSeeder() {
  console.log("🧪 Testing Industry-Standard Seeder...");

  try {
    // Test database connection
    await prisma.$connect();
    console.log("✅ Database connection successful");

    // Test basic queries
    const userCount = await prisma.user.count();
    const gameCount = await prisma.game.count();
    const tournamentCount = await prisma.tournament.count();

    console.log("📊 Current database state:");
    console.log(`   👥 Users: ${userCount}`);
    console.log(`   🎮 Games: ${gameCount}`);
    console.log(`   🏆 Tournaments: ${tournamentCount}`);

    if (userCount === 0 && gameCount === 0 && tournamentCount === 0) {
      console.log("✅ Database is clean and ready for seeding");
    } else {
      console.log("⚠️  Database contains existing data");
      console.log(
        "💡 Consider running 'npm run db:reset' to clear existing data"
      );
    }

    // Test Prisma client generation
    const games = await prisma.game.findMany({ take: 1 });
    console.log("✅ Prisma client is working correctly");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n🎯 Ready to run the industry-standard seeder!");
  console.log("💻 Run: npm run seed:industry-standard");
}

testSeeder();
