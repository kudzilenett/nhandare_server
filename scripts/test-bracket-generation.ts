import { PrismaClient } from "@prisma/client";
import { BracketGenerationService } from "../src/services/BracketGenerationService";
import { AdvancedSeedingService } from "../src/services/AdvancedSeedingService";
import logger from "../src/config/logger";

const prisma = new PrismaClient();

interface TestResult {
  tournamentId: string;
  tournamentTitle: string;
  bracketType: string;
  playerCount: number;
  seedingType: string;
  success: boolean;
  error?: string;
  generationTime?: number;
  validationResults?: any;
}

/**
 * Comprehensive bracket generation testing script
 * Tests all seeded tournaments to ensure bracket generation works correctly
 */
async function testBracketGeneration() {
  console.log("🧪 Starting Comprehensive Bracket Generation Testing...");

  const testResults: TestResult[] = [];
  const startTime = Date.now();

  try {
    // Get all tournaments for testing
    const tournaments = await prisma.tournament.findMany({
      include: {
        players: {
          include: {
            user: {
              include: {
                gameStats: true,
              },
            },
          },
        },
        game: true,
      },
      orderBy: [{ bracketType: "asc" }, { maxPlayers: "asc" }],
    });

    console.log(`📊 Found ${tournaments.length} tournaments to test`);

    // Test each tournament
    for (let i = 0; i < tournaments.length; i++) {
      const tournament = tournaments[i];

      if (tournament.players.length < 2) {
        console.log(
          `⚠️ Skipping tournament ${tournament.title} - insufficient players (${tournament.players.length})`
        );
        continue;
      }

      console.log(
        `\n🎯 Testing ${i + 1}/${tournaments.length}: ${tournament.title}`
      );
      console.log(
        `   Type: ${tournament.bracketType}, Players: ${tournament.players.length}`
      );

      const testResult: TestResult = {
        tournamentId: tournament.id,
        tournamentTitle: tournament.title,
        bracketType: tournament.bracketType,
        playerCount: tournament.players.length,
        seedingType: "unknown",
        success: false,
      };

      try {
        // Determine seeding type
        const useAdvancedSeeding =
          tournament.bracketConfig &&
          (tournament.bracketConfig as any).useAdvancedSeeding;
        testResult.seedingType = useAdvancedSeeding ? "advanced" : "basic";

        const generationStart = Date.now();

        // Generate bracket
        const bracket = await BracketGenerationService.generateBracket(
          tournament.id,
          useAdvancedSeeding
        );

        const generationEnd = Date.now();
        testResult.generationTime = generationEnd - generationStart;

        // Validate bracket
        console.log(
          `   ✅ Bracket generated in ${testResult.generationTime}ms`
        );
        console.log(
          `   📋 Total rounds: ${bracket.totalRounds}, Total matches: ${bracket.totalMatches}`
        );

        // Perform comprehensive validation
        const validationResults = await validateBracket(bracket, tournament);
        testResult.validationResults = validationResults;

        if (validationResults.isValid) {
          testResult.success = true;
          console.log(`   ✅ Bracket validation passed`);

          // Save bracket to database
          await prisma.tournament.update({
            where: { id: tournament.id },
            data: {
              bracket: bracket as any,
            },
          });

          console.log(`   💾 Bracket saved to database`);
        } else {
          testResult.error = `Validation failed: ${validationResults.errors.join(
            ", "
          )}`;
          console.log(`   ❌ Bracket validation failed: ${testResult.error}`);
        }
      } catch (error) {
        testResult.error = error.message;
        console.log(`   ❌ Bracket generation failed: ${error.message}`);
      }

      testResults.push(testResult);
    }

    const totalTime = Date.now() - startTime;

    // Generate comprehensive test report
    generateTestReport(testResults, totalTime);
  } catch (error) {
    console.error("❌ Testing failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Validate generated bracket for correctness
 */
async function validateBracket(bracket: any, tournament: any) {
  const errors: string[] = [];
  let isValid = true;

  try {
    // Basic structure validation
    if (!bracket.rounds || !Array.isArray(bracket.rounds)) {
      errors.push("Invalid bracket structure: missing rounds array");
      isValid = false;
    }

    if (bracket.players.length !== tournament.players.length) {
      errors.push(
        `Player count mismatch: expected ${tournament.players.length}, got ${bracket.players.length}`
      );
      isValid = false;
    }

    // Bracket type specific validation
    switch (tournament.bracketType) {
      case "SINGLE_ELIMINATION":
        await validateSingleElimination(bracket, errors);
        break;
      case "DOUBLE_ELIMINATION":
        await validateDoubleElimination(bracket, errors);
        break;
      case "ROUND_ROBIN":
        await validateRoundRobin(bracket, errors);
        break;
      case "SWISS":
        await validateSwiss(bracket, errors);
        break;
    }

    // Seeding validation
    validateSeeding(bracket, errors);

    // Match progression validation
    validateMatchProgression(bracket, errors);

    if (errors.length > 0) {
      isValid = false;
    }
  } catch (error) {
    errors.push(`Validation error: ${error.message}`);
    isValid = false;
  }

  return {
    isValid,
    errors,
    totalRounds: bracket.totalRounds,
    totalMatches: bracket.totalMatches,
    playerCount: bracket.players.length,
  };
}

/**
 * Validate single elimination bracket
 */
async function validateSingleElimination(bracket: any, errors: string[]) {
  const playerCount = bracket.players.length;
  const expectedRounds = Math.ceil(Math.log2(playerCount));
  const expectedMatches = playerCount - 1;

  if (bracket.totalRounds !== expectedRounds) {
    errors.push(
      `Single elimination round count mismatch: expected ${expectedRounds}, got ${bracket.totalRounds}`
    );
  }

  if (bracket.totalMatches !== expectedMatches) {
    errors.push(
      `Single elimination match count mismatch: expected ${expectedMatches}, got ${bracket.totalMatches}`
    );
  }

  // Validate each round has correct number of matches
  for (let i = 0; i < bracket.rounds.length; i++) {
    const round = bracket.rounds[i];
    const expectedMatchesInRound = Math.ceil(playerCount / Math.pow(2, i + 1));

    if (round.matches.length !== expectedMatchesInRound) {
      errors.push(
        `Round ${
          i + 1
        } match count mismatch: expected ${expectedMatchesInRound}, got ${
          round.matches.length
        }`
      );
    }
  }
}

/**
 * Validate double elimination bracket
 */
async function validateDoubleElimination(bracket: any, errors: string[]) {
  const playerCount = bracket.players.length;
  const winnersRounds = Math.ceil(Math.log2(playerCount));
  const losersRounds = (winnersRounds - 1) * 2;
  const expectedTotalRounds = winnersRounds + losersRounds + 1; // +1 for grand finals

  // Check for winners, losers, and grand finals brackets
  const winnersBracket = bracket.rounds.filter(
    (r: any) => r.bracketType === "winners"
  );
  const losersBracket = bracket.rounds.filter(
    (r: any) => r.bracketType === "losers"
  );
  const grandFinals = bracket.rounds.filter(
    (r: any) => r.bracketType === "grand_finals"
  );

  if (winnersBracket.length === 0) {
    errors.push("Double elimination missing winners bracket");
  }

  if (losersBracket.length === 0) {
    errors.push("Double elimination missing losers bracket");
  }

  if (grandFinals.length === 0) {
    errors.push("Double elimination missing grand finals");
  }
}

/**
 * Validate round robin bracket
 */
async function validateRoundRobin(bracket: any, errors: string[]) {
  const playerCount = bracket.players.length;
  const expectedRounds = playerCount % 2 === 0 ? playerCount - 1 : playerCount;
  const expectedMatches = (playerCount * (playerCount - 1)) / 2;

  if (bracket.totalRounds !== expectedRounds) {
    errors.push(
      `Round robin round count mismatch: expected ${expectedRounds}, got ${bracket.totalRounds}`
    );
  }

  if (bracket.totalMatches !== expectedMatches) {
    errors.push(
      `Round robin match count mismatch: expected ${expectedMatches}, got ${bracket.totalMatches}`
    );
  }

  // Check that each player plays every other player exactly once
  const playerMatchups = new Set<string>();

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (!match.isBye) {
        const player1Seed = match.player1Seed;
        const player2Seed = match.player2Seed;
        const matchup = `${Math.min(player1Seed, player2Seed)}-${Math.max(
          player1Seed,
          player2Seed
        )}`;

        if (playerMatchups.has(matchup)) {
          errors.push(`Duplicate matchup detected: ${matchup}`);
        }

        playerMatchups.add(matchup);
      }
    }
  }

  if (playerMatchups.size !== expectedMatches) {
    errors.push(
      `Round robin unique matchup count mismatch: expected ${expectedMatches}, got ${playerMatchups.size}`
    );
  }
}

/**
 * Validate Swiss system bracket
 */
async function validateSwiss(bracket: any, errors: string[]) {
  const playerCount = bracket.players.length;
  const expectedRounds = Math.ceil(Math.log2(playerCount));

  if (bracket.totalRounds !== expectedRounds) {
    errors.push(
      `Swiss system round count mismatch: expected ${expectedRounds}, got ${bracket.totalRounds}`
    );
  }

  // Each round should have approximately half the players in matches
  for (const round of bracket.rounds) {
    const expectedMatchesInRound = Math.floor(playerCount / 2);

    if (Math.abs(round.matches.length - expectedMatchesInRound) > 1) {
      errors.push(
        `Swiss round ${round.round} match count unexpected: expected ~${expectedMatchesInRound}, got ${round.matches.length}`
      );
    }
  }
}

/**
 * Validate seeding
 */
function validateSeeding(bracket: any, errors: string[]) {
  const players = bracket.players;

  // Check for duplicate seed numbers
  const seedNumbers = players.map((p: any) => p.seedNumber);
  const uniqueSeeds = new Set(seedNumbers);

  if (uniqueSeeds.size !== seedNumbers.length) {
    errors.push("Duplicate seed numbers detected");
  }

  // Check seed number range
  const minSeed = Math.min(...seedNumbers);
  const maxSeed = Math.max(...seedNumbers);

  if (minSeed !== 1) {
    errors.push(`Seeding should start from 1, but starts from ${minSeed}`);
  }

  if (maxSeed !== players.length) {
    errors.push(
      `Seeding should end at ${players.length}, but ends at ${maxSeed}`
    );
  }
}

/**
 * Validate match progression
 */
function validateMatchProgression(bracket: any, errors: string[]) {
  // Check that matches have proper progression links
  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (match.nextMatchId && !match.isBye) {
        // Verify that the next match exists
        const nextMatchExists = bracket.rounds.some((r: any) =>
          r.matches.some((m: any) => m.id === match.nextMatchId)
        );

        if (!nextMatchExists) {
          errors.push(
            `Match ${match.id} references non-existent next match ${match.nextMatchId}`
          );
        }
      }
    }
  }
}

/**
 * Generate comprehensive test report
 */
function generateTestReport(testResults: TestResult[], totalTime: number) {
  console.log("\n" + "=".repeat(80));
  console.log("🏆 COMPREHENSIVE BRACKET GENERATION TEST REPORT");
  console.log("=".repeat(80));

  const successCount = testResults.filter((r) => r.success).length;
  const failureCount = testResults.length - successCount;

  console.log(`\n📊 Overall Results:`);
  console.log(`   Total Tournaments Tested: ${testResults.length}`);
  console.log(
    `   Successful Generations: ${successCount} (${(
      (successCount / testResults.length) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `   Failed Generations: ${failureCount} (${(
      (failureCount / testResults.length) *
      100
    ).toFixed(1)}%)`
  );
  console.log(`   Total Testing Time: ${(totalTime / 1000).toFixed(2)}s`);

  // Results by bracket type
  console.log(`\n🎯 Results by Bracket Type:`);
  const bracketTypes = [...new Set(testResults.map((r) => r.bracketType))];

  for (const bracketType of bracketTypes) {
    const typeResults = testResults.filter(
      (r) => r.bracketType === bracketType
    );
    const typeSuccesses = typeResults.filter((r) => r.success).length;
    const avgTime =
      typeResults.reduce((sum, r) => sum + (r.generationTime || 0), 0) /
      typeResults.length;

    console.log(`   ${bracketType}:`);
    console.log(
      `     Tests: ${typeResults.length}, Success: ${typeSuccesses}/${
        typeResults.length
      } (${((typeSuccesses / typeResults.length) * 100).toFixed(1)}%)`
    );
    console.log(`     Avg Generation Time: ${avgTime.toFixed(0)}ms`);
  }

  // Results by seeding type
  console.log(`\n🧮 Results by Seeding Type:`);
  const seedingTypes = [...new Set(testResults.map((r) => r.seedingType))];

  for (const seedingType of seedingTypes) {
    const typeResults = testResults.filter(
      (r) => r.seedingType === seedingType
    );
    const typeSuccesses = typeResults.filter((r) => r.success).length;
    const avgTime =
      typeResults.reduce((sum, r) => sum + (r.generationTime || 0), 0) /
      typeResults.length;

    console.log(`   ${seedingType} seeding:`);
    console.log(
      `     Tests: ${typeResults.length}, Success: ${typeSuccesses}/${
        typeResults.length
      } (${((typeSuccesses / typeResults.length) * 100).toFixed(1)}%)`
    );
    console.log(`     Avg Generation Time: ${avgTime.toFixed(0)}ms`);
  }

  // Player count analysis
  console.log(`\n👥 Results by Player Count:`);
  const playerCounts = [...new Set(testResults.map((r) => r.playerCount))].sort(
    (a, b) => a - b
  );

  for (const playerCount of playerCounts) {
    const countResults = testResults.filter(
      (r) => r.playerCount === playerCount
    );
    const countSuccesses = countResults.filter((r) => r.success).length;

    if (countResults.length > 0) {
      console.log(
        `   ${playerCount} players: ${countSuccesses}/${
          countResults.length
        } success (${((countSuccesses / countResults.length) * 100).toFixed(
          1
        )}%)`
      );
    }
  }

  // Failed tests details
  if (failureCount > 0) {
    console.log(`\n❌ Failed Tests Details:`);
    const failedTests = testResults.filter((r) => !r.success);

    for (const test of failedTests) {
      console.log(`   ${test.tournamentTitle}:`);
      console.log(
        `     Type: ${test.bracketType}, Players: ${test.playerCount}, Seeding: ${test.seedingType}`
      );
      console.log(`     Error: ${test.error}`);
    }
  }

  // Performance metrics
  console.log(`\n⚡ Performance Metrics:`);
  const generationTimes = testResults
    .filter((r) => r.generationTime)
    .map((r) => r.generationTime!);

  if (generationTimes.length > 0) {
    const avgTime =
      generationTimes.reduce((sum, time) => sum + time, 0) /
      generationTimes.length;
    const minTime = Math.min(...generationTimes);
    const maxTime = Math.max(...generationTimes);

    console.log(`   Average Generation Time: ${avgTime.toFixed(0)}ms`);
    console.log(`   Fastest Generation: ${minTime}ms`);
    console.log(`   Slowest Generation: ${maxTime}ms`);
  }

  console.log(
    `\n🎉 Testing Complete! ${
      successCount === testResults.length
        ? "All tests passed!"
        : `${failureCount} tests need attention.`
    }`
  );
  console.log("=".repeat(80));
}

// Export for use in other scripts
export { testBracketGeneration, validateBracket };

// Run if called directly
if (require.main === module) {
  testBracketGeneration().catch((error) => {
    console.error("❌ Bracket generation testing failed:", error);
    process.exit(1);
  });
}
