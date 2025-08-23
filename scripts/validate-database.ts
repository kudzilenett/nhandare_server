import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function validateDatabase() {
  console.log("🔍 Validating database integrity...");
  
  try {
    // Check tournaments
    const tournaments = await prisma.tournament.findMany({
      include: {
        players: true,
        _count: {
          select: {
            players: true,
            matches: true,
          },
        },
      },
    });
    
    console.log(`📊 Found ${tournaments.length} tournaments`);
    
    let validTournaments = 0;
    let invalidTournaments = 0;
    
    for (const tournament of tournaments) {
      const isValid = tournament._count.players >= 2 && 
                     tournament._count.players <= tournament.maxPlayers &&
                     tournament.currentPlayers === tournament._count.players;
      
      if (isValid) {
        validTournaments++;
      } else {
        invalidTournaments++;
        console.log(`⚠️ Invalid tournament: ${tournament.title}`);
      }
    }
    
    console.log(`✅ Valid tournaments: ${validTournaments}`);
    console.log(`❌ Invalid tournaments: ${invalidTournaments}`);
    
    // Check bracket types distribution
    const bracketTypes = await prisma.tournament.groupBy({
      by: ['bracketType'],
      _count: {
        bracketType: true,
      },
    });
    
    console.log(`\n🎯 Bracket type distribution:`);
    for (const bt of bracketTypes) {
      console.log(`   ${bt.bracketType}: ${bt._count.bracketType} tournaments`);
    }
    
    // Check users
    const userCount = await prisma.user.count();
    const verifiedUsers = await prisma.user.count({ where: { isVerified: true } });
    
    console.log(`\n👥 Users:`);
    console.log(`   Total: ${userCount}`);
    console.log(`   Verified: ${verifiedUsers} (${((verifiedUsers / userCount) * 100).toFixed(1)}%)`);
    
    console.log(`\n✅ Database validation completed`);
    
  } catch (error) {
    console.error("❌ Database validation failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  validateDatabase()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default validateDatabase;