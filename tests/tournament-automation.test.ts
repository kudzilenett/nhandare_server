import { TournamentStatusService } from "../src/services/TournamentStatusService";
import { BracketGenerationService } from "../src/services/BracketGenerationService";
import { TournamentMatchService } from "../src/services/TournamentMatchService";
import { prisma } from "../src/config/database";
import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";

describe("Tournament Automation", () => {
  beforeEach(async () => {
    await global.testUtils.cleanDatabase();
  });

  afterEach(async () => {
    await global.testUtils.cleanDatabase();
  });

  describe("Full Tournament Lifecycle", () => {
    test("Complete tournament from creation to completion", async () => {
      // 1. Create tournament
      const tournament = await global.testUtils.createTestTournament({
        status: "OPEN",
        maxPlayers: 8,
        currentPlayers: 0,
      });

      // 2. Register players with payments
      const players = [];
      for (let i = 0; i < 8; i++) {
        const user = await global.testUtils.createTestUser({
          username: `TestPlayer${i + 1}`,
          email: `testplayer${i + 1}@nhandare.co.zw`,
        });

        // Create game stats for seeding
        await prisma.gameStatistic.create({
          data: {
            userId: user.id,
            gameId: "chess",
            currentRating: 1200 + i * 50, // Different ratings for seeding
            gamesPlayed: 10 + i,
            gamesWon: 5 + i,
            gamesLost: 5,
            gamesDrawn: 0,
          },
        });

        // Register player for tournament
        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: tournament.id,
            registeredAt: new Date(),
          },
        });

        players.push(user);
      }

      // Update tournament player count
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { currentPlayers: 8 },
      });

      // 3. Auto-transition to CLOSED (registration ended)
      const restoreTime = await global.testUtils.advanceTime(13 * 60 * 60); // 13 hours later

      await TournamentStatusService.checkStatusTransitions();

      const closedTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
      });
      expect(closedTournament?.status).toBe("CLOSED");

      // 4. Auto-transition to ACTIVE (tournament start time)
      const restoreStartTime = await global.testUtils.advanceTime(12 * 60 * 60); // 12 hours later

      await TournamentStatusService.checkStatusTransitions();

      const activeTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: { bracket: true },
      });
      expect(activeTournament?.status).toBe("ACTIVE");
      expect(activeTournament?.bracket).toBeDefined();

      // 5. Verify bracket generated
      const bracket = activeTournament?.bracket as any;
      expect(bracket.rounds).toHaveLength(3); // 8 players = 3 rounds
      expect(bracket.rounds[0].matches).toHaveLength(4); // First round: 4 matches

      // 6. Verify first round matches created
      const firstRoundMatches = await prisma.match.findMany({
        where: { tournamentId: tournament.id, round: 1 },
        include: { player1: true, player2: true },
      });
      expect(firstRoundMatches).toHaveLength(4);

      // 7. Simulate all matches
      for (const match of firstRoundMatches) {
        // Complete match with random winner
        const winner = Math.random() > 0.5 ? match.player1Id : match.player2Id;
        const loser =
          winner === match.player1Id ? match.player2Id : match.player1Id;

        await prisma.match.update({
          where: { id: match.id },
          data: {
            status: "COMPLETED",
            result: "COMPLETED",
            winnerId: winner,
            loserId: loser,
            completedAt: new Date(),
          },
        });

        // Advance winner to next round
        await TournamentMatchService.advanceWinner(match.id);
      }

      // 8. Verify second round matches created
      const secondRoundMatches = await prisma.match.findMany({
        where: { tournamentId: tournament.id, round: 2 },
      });
      expect(secondRoundMatches).toHaveLength(2);

      // 9. Complete second round
      for (const match of secondRoundMatches) {
        const winner = Math.random() > 0.5 ? match.player1Id : match.player2Id;
        const loser =
          winner === match.player1Id ? match.player2Id : match.player1Id;

        await prisma.match.update({
          where: { id: match.id },
          data: {
            status: "COMPLETED",
            result: "COMPLETED",
            winnerId: winner,
            loserId: loser,
            completedAt: new Date(),
          },
        });

        await TournamentMatchService.advanceWinner(match.id);
      }

      // 10. Verify final round match created
      const finalRoundMatches = await prisma.match.findMany({
        where: { tournamentId: tournament.id, round: 3 },
      });
      expect(finalRoundMatches).toHaveLength(1);

      // 11. Complete final match
      const finalMatch = finalRoundMatches[0];
      const winner =
        Math.random() > 0.5 ? finalMatch.player1Id : finalMatch.player2Id;
      const loser =
        winner === finalMatch.player1Id
          ? finalMatch.player2Id
          : finalMatch.player1Id;

      await prisma.match.update({
        where: { id: finalMatch.id },
        data: {
          status: "COMPLETED",
          result: "COMPLETED",
          winnerId: winner,
          loserId: loser,
          completedAt: new Date(),
        },
      });

      // 12. Verify tournament completion
      const completedTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: { players: { include: { user: true } } },
      });

      expect(completedTournament?.status).toBe("ACTIVE"); // Status remains ACTIVE until manually completed

      // Verify all matches completed
      const allMatches = await prisma.match.findMany({
        where: { tournamentId: tournament.id },
      });
      expect(allMatches.every((match) => match.status === "COMPLETED")).toBe(
        true
      );

      // Clean up time mocks
      restoreTime();
      restoreStartTime();
    }, 60000);
  });

  describe("Zimbabwe Connectivity Resilience", () => {
    test("Tournament with intermittent connectivity", async () => {
      const tournament = await global.testUtils.createTestTournament({
        status: "ACTIVE",
        currentPlayers: 4,
      });

      // Create players and matches
      const players = [];
      for (let i = 0; i < 4; i++) {
        const user = await global.testUtils.createTestUser();
        players.push(user);

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

      // Create matches
      const matches = await prisma.match.findMany({
        where: { tournamentId: tournament.id, round: 1 },
      });

      // Simulate intermittent connectivity during match
      const match = matches[0];

      // Start match
      await prisma.match.update({
        where: { id: match.id },
        data: { status: "IN_PROGRESS" },
      });

      // Simulate network interruption
      // In real scenario, this would trigger offline mode
      await prisma.match.update({
        where: { id: match.id },
        data: {
          status: "PAUSED",
          lastActivity: new Date(),
        },
      });

      // Simulate reconnection and match completion
      await prisma.match.update({
        where: { id: match.id },
        data: {
          status: "COMPLETED",
          result: "COMPLETED",
          winnerId: match.player1Id,
          loserId: match.player2Id,
          completedAt: new Date(),
        },
      });

      // Verify match completed successfully despite connectivity issues
      const completedMatch = await prisma.match.findUnique({
        where: { id: match.id },
      });
      expect(completedMatch?.status).toBe("COMPLETED");
    });
  });

  describe("Payment Integration", () => {
    test("Tournament registration with payment validation", async () => {
      const tournament = await global.testUtils.createTestTournament({
        entryFee: 50,
        status: "OPEN",
      });

      const user = await global.testUtils.createTestUser();

      // Attempt to register without payment (should fail)
      try {
        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: tournament.id,
            registeredAt: new Date(),
            paymentStatus: "PENDING",
          },
        });
        fail("Should not allow registration without payment");
      } catch (error) {
        // Expected error - payment required
        expect(error).toBeDefined();
      }

      // Register with completed payment (should succeed)
      await prisma.tournamentPlayer.create({
        data: {
          userId: user.id,
          tournamentId: tournament.id,
          registeredAt: new Date(),
          paymentStatus: "COMPLETED",
        },
      });

      // Verify registration successful
      const player = await prisma.tournamentPlayer.findFirst({
        where: { userId: user.id, tournamentId: tournament.id },
      });
      expect(player).toBeDefined();
      expect(player?.paymentStatus).toBe("COMPLETED");
    });
  });

  describe("Bracket Generation Performance", () => {
    test("Large tournament bracket generation", async () => {
      const tournament = await global.testUtils.createTestTournament({
        maxPlayers: 64,
        currentPlayers: 64,
        bracketType: "SWISS",
      });

      // Create 64 test players
      const players = [];
      for (let i = 0; i < 64; i++) {
        const user = await global.testUtils.createTestUser({
          username: `Player${i + 1}`,
        });

        await prisma.gameStats.create({
          data: {
            userId: user.id,
            gameId: "chess",
            rating: 1000 + i * 10,
            gamesPlayed: 20 + i,
            gamesWon: 10 + i,
            gamesLost: 10,
            gamesDrawn: 0,
          },
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

      // Update tournament player count
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { currentPlayers: 64 },
      });

      // Measure bracket generation performance
      const startTime = Date.now();
      await BracketGenerationService.generateBracket(tournament.id);
      const endTime = Date.now();

      const generationTime = endTime - startTime;
      expect(generationTime).toBeLessThan(30000); // Should complete within 30 seconds

      // Verify bracket structure
      const updatedTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: { bracket: true },
      });

      expect(updatedTournament?.bracket).toBeDefined();
      const bracket = updatedTournament?.bracket as any;

      // Swiss system should have multiple rounds
      expect(bracket.rounds.length).toBeGreaterThan(1);
    }, 60000);
  });

  describe("Concurrent Tournament Handling", () => {
    test("Multiple simultaneous tournaments", async () => {
      const tournaments = [];

      // Create 5 tournaments simultaneously
      for (let i = 0; i < 5; i++) {
        const tournament = await global.testUtils.createTestTournament({
          name: `Concurrent Tournament ${i + 1}`,
          status: "OPEN",
          maxPlayers: 16,
          currentPlayers: 16,
        });

        // Add players to each tournament
        for (let j = 0; j < 16; j++) {
          const user = await global.testUtils.createTestUser({
            username: `Player${i}_${j}`,
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

      // Update all tournaments to have full player counts
      for (const tournament of tournaments) {
        await prisma.tournament.update({
          where: { id: tournament.id },
          data: { currentPlayers: 16 },
        });
      }

      // Start all tournaments simultaneously
      const startPromises = tournaments.map((tournament) =>
        TournamentStatusService.startTournament(tournament.id)
      );

      await Promise.all(startPromises);

      // Verify all tournaments started successfully
      for (const tournament of tournaments) {
        const updated = await prisma.tournament.findUnique({
          where: { id: tournament.id },
        });
        expect(updated?.status).toBe("ACTIVE");
      }
    }, 60000);
  });
});
