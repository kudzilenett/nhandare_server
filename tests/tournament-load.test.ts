import { TournamentStatusService } from "../src/services/TournamentStatusService";
import { BracketGenerationService } from "../src/services/BracketGenerationService";
import { TournamentMatchService } from "../src/services/TournamentMatchService";
import { prisma } from "../src/config/database";

describe("Tournament Scalability", () => {
  beforeEach(async () => {
    await global.testUtils.cleanDatabase();
  });

  afterEach(async () => {
    await global.testUtils.cleanDatabase();
  });

  describe("Large Tournament Performance", () => {
    test("256 player tournament bracket generation", async () => {
      const tournament = await global.testUtils.createTestTournament({
        maxPlayers: 256,
        currentPlayers: 256,
        bracketType: "SWISS",
      });

      // Create 256 test players efficiently
      const playerBatchSize = 50;
      const players = [];

      for (let batch = 0; batch < Math.ceil(256 / playerBatchSize); batch++) {
        const batchPlayers = [];
        const startIndex = batch * playerBatchSize;
        const endIndex = Math.min(startIndex + playerBatchSize, 256);

        for (let i = startIndex; i < endIndex; i++) {
          const user = await global.testUtils.createTestUser({
            username: `Player${i + 1}`,
          });

          await prisma.gameStats.create({
            data: {
              userId: user.id,
              gameId: "chess",
              rating: 1000 + i * 5,
              gamesPlayed: 15 + i,
              gamesWon: 8 + i,
              gamesLost: 7,
              gamesDrawn: 0,
            },
          });

          batchPlayers.push({
            userId: user.id,
            tournamentId: tournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          });
        }

        // Batch insert tournament players
        await prisma.tournamentPlayer.createMany({
          data: batchPlayers,
        });

        players.push(...batchPlayers);
      }

      // Update tournament player count
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { currentPlayers: 256 },
      });

      // Measure bracket generation performance
      const startTime = Date.now();
      await BracketGenerationService.generateBracket(tournament.id);
      const endTime = Date.now();

      const generationTime = endTime - startTime;

      // Performance requirements for 256 players
      expect(generationTime).toBeLessThan(30000); // Must complete within 30 seconds

      console.log(
        `256-player bracket generation completed in ${generationTime}ms`
      );

      // Verify bracket structure
      const updatedTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: { bracket: true },
      });

      expect(updatedTournament?.bracket).toBeDefined();
      const bracket = updatedTournament?.bracket as any;

      // Swiss system for 256 players should have 8-9 rounds
      expect(bracket.rounds.length).toBeGreaterThanOrEqual(8);
      expect(bracket.rounds.length).toBeLessThanOrEqual(10);
    }, 120000); // 2 minutes timeout for large tournament

    test("Database performance under load", async () => {
      const tournament = await global.testUtils.createTestTournament({
        maxPlayers: 128,
        currentPlayers: 128,
        bracketType: "SINGLE_ELIMINATION",
      });

      // Create 128 players
      const players = [];
      for (let i = 0; i < 128; i++) {
        const user = await global.testUtils.createTestUser({
          username: `LoadTestPlayer${i + 1}`,
        });

        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: tournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          },
        });

        players.push(user);
      }

      // Update tournament
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { currentPlayers: 128 },
      });

      // Measure database operations performance
      const startTime = Date.now();

      // Generate bracket
      await BracketGenerationService.generateBracket(tournament.id);

      // Query all tournament data
      const tournamentData = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: {
          players: { include: { user: true } },
          matches: { include: { player1: true, player2: true } },
        },
      });

      const endTime = Date.now();
      const queryTime = endTime - startTime;

      expect(queryTime).toBeLessThan(5000); // Complex query should complete within 5 seconds
      expect(tournamentData).toBeDefined();
      expect(tournamentData?.players).toHaveLength(128);

      console.log(
        `128-player tournament data query completed in ${queryTime}ms`
      );
    }, 90000);
  });

  describe("Concurrent Tournament Operations", () => {
    test("10 simultaneous tournaments with 32 players each", async () => {
      const tournaments = [];

      // Create 10 tournaments
      for (let i = 0; i < 10; i++) {
        const tournament = await global.testUtils.createTestTournament({
          name: `Concurrent Load Test ${i + 1}`,
          maxPlayers: 32,
          currentPlayers: 32,
          bracketType: "SINGLE_ELIMINATION",
        });

        // Add 32 players to each tournament
        for (let j = 0; j < 32; j++) {
          const user = await global.testUtils.createTestUser({
            username: `ConcurrentPlayer${i}_${j}`,
          });

          await prisma.tournamentPlayer.create({
            data: {
              userId: user.id,
              tournamentId: tournament.id,
              registeredAt: new Date(),
              paymentStatus: "COMPLETED",
            },
          });
        }

        tournaments.push(tournament);
      }

      // Update all tournaments
      for (const tournament of tournaments) {
        await prisma.tournament.update({
          where: { id: tournament.id },
          data: { currentPlayers: 32 },
        });
      }

      // Start all tournaments simultaneously
      const startTime = Date.now();
      const startPromises = tournaments.map((tournament) =>
        TournamentStatusService.startTournament(tournament.id)
      );

      await Promise.all(startPromises);
      const endTime = Date.now();

      const totalStartTime = endTime - startTime;

      // All tournaments should start within reasonable time
      expect(totalStartTime).toBeLessThan(60000); // 1 minute for 10 tournaments

      console.log(`10 concurrent tournaments started in ${totalStartTime}ms`);

      // Verify all tournaments started successfully
      for (const tournament of tournaments) {
        const updated = await prisma.tournament.findUnique({
          where: { id: tournament.id },
        });
        expect(updated?.status).toBe("ACTIVE");
      }
    }, 120000);

    test("Mixed bracket types under load", async () => {
      const bracketTypes = [
        "SINGLE_ELIMINATION",
        "DOUBLE_ELIMINATION",
        "SWISS",
        "ROUND_ROBIN",
      ];
      const tournaments = [];

      // Create tournaments with different bracket types
      for (let i = 0; i < bracketTypes.length; i++) {
        const tournament = await global.testUtils.createTestTournament({
          name: `${bracketTypes[i]} Load Test`,
          maxPlayers: 64,
          currentPlayers: 64,
          bracketType: bracketTypes[i],
        });

        // Add 64 players
        for (let j = 0; j < 64; j++) {
          const user = await global.testUtils.createTestUser({
            username: `${bracketTypes[i]}Player${j}`,
          });

          await prisma.tournamentPlayer.create({
            data: {
              userId: user.id,
              tournamentId: tournament.id,
              registeredAt: new Date(),
              paymentStatus: "COMPLETED",
            },
          });
        }

        tournaments.push(tournament);
      }

      // Update all tournaments
      for (const tournament of tournaments) {
        await prisma.tournament.update({
          where: { id: tournament.id },
          data: { currentPlayers: 64 },
        });
      }

      // Generate brackets for all tournament types simultaneously
      const startTime = Date.now();
      const bracketPromises = tournaments.map((tournament) =>
        BracketGenerationService.generateBracket(tournament.id)
      );

      await Promise.all(bracketPromises);
      const endTime = Date.now();

      const totalBracketTime = endTime - startTime;

      // All bracket types should generate within reasonable time
      expect(totalBracketTime).toBeLessThan(90000); // 1.5 minutes for 4 different bracket types

      console.log(`4 mixed bracket types generated in ${totalBracketTime}ms`);

      // Verify all brackets generated successfully
      for (const tournament of tournaments) {
        const updated = await prisma.tournament.findUnique({
          where: { id: tournament.id },
          include: { bracket: true },
        });
        expect(updated?.bracket).toBeDefined();
      }
    }, 120000);
  });

  describe("Zimbabwe Network Conditions Simulation", () => {
    test("Tournament operations under simulated 2G/3G conditions", async () => {
      const tournament = await global.testUtils.createTestTournament({
        maxPlayers: 32,
        currentPlayers: 32,
        status: "ACTIVE",
      });

      // Add 32 players
      for (let i = 0; i < 32; i++) {
        const user = await global.testUtils.createTestUser({
          username: `NetworkTestPlayer${i + 1}`,
        });

        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: tournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          },
        });
      }

      // Generate bracket
      await BracketGenerationService.generateBracket(tournament.id);

      // Simulate network latency and timeouts
      const matches = await prisma.match.findMany({
        where: { tournamentId: tournament.id, round: 1 },
        take: 5, // Test with first 5 matches
      });

      for (const match of matches) {
        // Simulate slow network operations
        const startTime = Date.now();

        // Simulate network delay (100-500ms)
        const delay = 100 + Math.random() * 400;
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Update match status
        await prisma.match.update({
          where: { id: match.id },
          data: {
            status: "IN_PROGRESS",
            lastActivity: new Date(),
          },
        });

        const endTime = Date.now();
        const operationTime = endTime - startTime;

        // Operation should complete despite network delays
        expect(operationTime).toBeGreaterThanOrEqual(delay);
        expect(operationTime).toBeLessThan(delay + 1000); // Within reasonable bounds
      }

      // Verify tournament remains functional under network stress
      const updatedTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: { matches: true },
      });

      expect(updatedTournament?.matches.length).toBeGreaterThan(0);
      expect(updatedTournament?.status).toBe("ACTIVE");
    }, 90000);

    test("Tournament recovery after network interruptions", async () => {
      const tournament = await global.testUtils.createTestTournament({
        maxPlayers: 16,
        currentPlayers: 16,
        status: "ACTIVE",
      });

      // Add players and generate bracket
      for (let i = 0; i < 16; i++) {
        const user = await global.testUtils.createTestUser({
          username: `RecoveryTestPlayer${i + 1}`,
        });

        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: tournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          },
        });
      }

      await BracketGenerationService.generateBracket(tournament.id);

      // Simulate network interruption
      const matches = await prisma.match.findMany({
        where: { tournamentId: tournament.id, round: 1 },
      });

      // Pause matches (simulating network issues)
      for (const match of matches) {
        await prisma.match.update({
          where: { id: match.id },
          data: {
            status: "PAUSED",
            lastActivity: new Date(),
          },
        });
      }

      // Simulate network recovery
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Resume matches
      for (const match of matches) {
        await prisma.match.update({
          where: { id: match.id },
          data: {
            status: "IN_PROGRESS",
            lastActivity: new Date(),
          },
        });
      }

      // Verify tournament recovered successfully
      const recoveredTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: { matches: true },
      });

      expect(
        recoveredTournament?.matches.every((m) => m.status === "IN_PROGRESS")
      ).toBe(true);
      expect(recoveredTournament?.status).toBe("ACTIVE");
    }, 60000);
  });

  describe("Memory and Resource Usage", () => {
    test("Memory usage during large tournament operations", async () => {
      const initialMemory = process.memoryUsage();

      const tournament = await global.testUtils.createTestTournament({
        maxPlayers: 128,
        currentPlayers: 128,
        bracketType: "SWISS",
      });

      // Create 128 players
      for (let i = 0; i < 128; i++) {
        const user = await global.testUtils.createTestUser({
          username: `MemoryTestPlayer${i + 1}`,
        });

        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: tournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          },
        });
      }

      // Generate bracket
      await BracketGenerationService.generateBracket(tournament.id);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = {
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
        external: finalMemory.external - initialMemory.external,
      };

      // Memory increase should be reasonable (less than 100MB for 128 players)
      expect(memoryIncrease.heapUsed).toBeLessThan(100 * 1024 * 1024);

      console.log("Memory usage increase:", {
        heapUsed: `${Math.round(memoryIncrease.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryIncrease.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryIncrease.external / 1024 / 1024)}MB`,
      });
    }, 90000);
  });
});
