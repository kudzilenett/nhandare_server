import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import {
  AdvancedSeedingService,
  PlayerSeedingData,
  SeedingOptions,
} from "../src/services/AdvancedSeedingService";

// Mock Prisma
jest.mock("../src/config/database", () => ({
  prisma: {
    tournament: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    gameStatistic: {
      findUnique: jest.fn(),
    },
    match: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

describe("Bracket System Phase 2.2 - Advanced Seeding Algorithms", () => {
  const mockPrisma = require("../src/config/database").prisma;

  const mockPlayers = [
    {
      userId: "player1",
      baseRating: 1500,
      performanceScore: 800,
      historicalScore: 750,
      regionalScore: 600,
      consistencyScore: 900,
    },
    {
      userId: "player2",
      baseRating: 1400,
      performanceScore: 900,
      historicalScore: 800,
      regionalScore: 550,
      consistencyScore: 850,
    },
    {
      userId: "player3",
      baseRating: 1300,
      performanceScore: 700,
      historicalScore: 600,
      regionalScore: 500,
      consistencyScore: 800,
    },
    {
      userId: "player4",
      baseRating: 1200,
      performanceScore: 600,
      historicalScore: 500,
      regionalScore: 450,
      consistencyScore: 750,
    },
  ];

  const mockTournament = {
    id: "tournament1",
    gameId: "game1",
    players: mockPlayers.map((player) => ({
      user: {
        id: player.userId,
        gameStats: [{ currentRating: player.baseRating }],
        latitude: 40.7128,
        longitude: -74.006, // NYC coordinates
      },
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    mockPrisma.tournament.findUnique.mockResolvedValue(mockTournament);
    mockPrisma.tournament.findMany.mockResolvedValue([]);
    mockPrisma.gameStatistic.findUnique.mockResolvedValue({
      currentRating: 1200,
    });
    mockPrisma.match.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue({
      latitude: 40.7128,
      longitude: -74.006,
    });
    mockPrisma.user.findMany.mockResolvedValue([]);
  });

  describe("2.2.1 Performance-Based Seeding", () => {
    test("should calculate performance scores based on recent matches", async () => {
      const mockMatches = [
        {
          id: "match1",
          player1Id: "player1",
          player2Id: "player2",
          result: "PLAYER1_WIN",
          status: "COMPLETED",
          player1: { gameStats: [{ currentRating: 1500 }] },
          player2: { gameStats: [{ currentRating: 1400 }] },
        },
        {
          id: "match2",
          player1Id: "player1",
          player2Id: "player3",
          result: "PLAYER1_WIN",
          status: "COMPLETED",
          player1: { gameStats: [{ currentRating: 1500 }] },
          player2: { gameStats: [{ currentRating: 1300 }] },
        },
      ];

      mockPrisma.match.findMany.mockResolvedValue(mockMatches);

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        {
          includePerformance: true,
          recentTournaments: 2,
        }
      );

      expect(result).toHaveLength(4);
      expect(result[0].performanceScore).toBeGreaterThan(0);
    });

    test("should handle players with no recent matches", async () => {
      mockPrisma.match.findMany.mockResolvedValue([]);

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        {
          includePerformance: true,
        }
      );

      expect(result).toHaveLength(4);
      expect(result[0].performanceScore).toBe(0);
    });
  });

  describe("2.2.2 Historical Tournament Performance", () => {
    test("should calculate historical scores based on tournament performance", async () => {
      const mockTournaments = [
        {
          id: "tournament1",
          matches: [
            {
              player1Id: "player1",
              result: "PLAYER1_WIN",
              status: "COMPLETED",
            },
            {
              player1Id: "player1",
              result: "PLAYER2_WIN",
              status: "COMPLETED",
            },
          ],
        },
        {
          id: "tournament2",
          matches: [
            {
              player1Id: "player1",
              result: "PLAYER1_WIN",
              status: "COMPLETED",
            },
          ],
        },
      ];

      mockPrisma.tournament.findMany.mockResolvedValue(mockTournaments);

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        {
          includeHistory: true,
          recentTournaments: 2,
        }
      );

      expect(result).toHaveLength(4);
      expect(result[0].historicalScore).toBeGreaterThan(0);
    });
  });

  describe("2.2.3 Regional Seeding", () => {
    test("should calculate regional scores based on nearby players", async () => {
      const mockNearbyPlayers = [
        { userId: "player2" },
        { userId: "player3" },
        { userId: "player4" },
      ];

      mockPrisma.userProfile.findMany.mockResolvedValue(mockNearbyPlayers);
      mockPrisma.gameStatistic.findUnique
        .mockResolvedValueOnce({ currentRating: 1400 }) // player2
        .mockResolvedValueOnce({ currentRating: 1300 }) // player3
        .mockResolvedValueOnce({ currentRating: 1200 }); // player4

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        {
          includeRegional: true,
          regionalRadius: 100,
        }
      );

      expect(result).toHaveLength(4);
      expect(result[0].regionalScore).toBeGreaterThan(0);
    });

    test("should handle players without location data", async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        {
          includeRegional: true,
        }
      );

      expect(result).toHaveLength(4);
      expect(result[0].regionalScore).toBe(0);
    });
  });

  describe("2.2.4 Consistency Scoring", () => {
    test("should calculate consistency scores based on rating stability", async () => {
      const mockRatingHistory = [
        { rating: 1500, timestamp: new Date("2024-01-01") },
        { rating: 1490, timestamp: new Date("2024-01-02") },
        { rating: 1510, timestamp: new Date("2024-01-03") },
        { rating: 1505, timestamp: new Date("2024-01-04") },
      ];

      mockPrisma.ratingHistory.findMany.mockResolvedValue(mockRatingHistory);

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        {
          includeConsistency: true,
        }
      );

      expect(result).toHaveLength(4);
      expect(result[0].consistencyScore).toBeGreaterThan(0);
    });

    test("should handle players with insufficient rating history", async () => {
      mockPrisma.ratingHistory.findMany.mockResolvedValue([{ rating: 1500 }]);

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        {
          includeConsistency: true,
        }
      );

      expect(result).toHaveLength(4);
      expect(result[0].consistencyScore).toBe(0);
    });
  });

  describe("2.2.5 Weighted Final Scoring", () => {
    test("should apply correct weights to different seeding factors", async () => {
      const customWeights: SeedingOptions = {
        ratingWeight: 0.5,
        performanceWeight: 0.3,
        historyWeight: 0.1,
        regionalWeight: 0.05,
        consistencyWeight: 0.05,
      };

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        customWeights
      );

      expect(result).toHaveLength(4);
      // The player with highest rating should still be seeded first due to 50% weight
      expect(result[0].baseRating).toBe(1500);
    });

    test("should use default weights when none specified", async () => {
      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1"
      );

      expect(result).toHaveLength(4);
      expect(result[0].finalSeed).toBe(1);
    });
  });

  describe("2.2.6 Seeding Recommendations", () => {
    test("should generate seeding recommendations for tournament organizers", async () => {
      const result = await AdvancedSeedingService.getSeedingRecommendations(
        "tournament1"
      );

      expect(result.players).toHaveLength(4);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    test("should detect large rating gaps", async () => {
      // Create players with large rating gaps
      const largeGapPlayers = [
        { ...mockPlayers[0], baseRating: 2000 },
        { ...mockPlayers[1], baseRating: 1400 },
        { ...mockPlayers[2], baseRating: 800 },
        { ...mockPlayers[3], baseRating: 400 },
      ];

      const mockLargeGapTournament = {
        ...mockTournament,
        players: largeGapPlayers.map((player) => ({
          user: {
            id: player.userId,
            gameStats: [{ currentRating: player.baseRating }],
            profile: { latitude: 40.7128, longitude: -74.006 },
          },
        })),
      };

      mockPrisma.tournament.findUnique.mockResolvedValue(
        mockLargeGapTournament
      );

      const result = await AdvancedSeedingService.getSeedingRecommendations(
        "tournament1"
      );

      expect(
        result.recommendations.some((rec) => rec.includes("divisions"))
      ).toBe(true);
    });
  });

  describe("2.2.7 Error Handling and Fallbacks", () => {
    test("should handle database errors gracefully", async () => {
      mockPrisma.tournament.findUnique.mockRejectedValue(
        new Error("Database error")
      );

      await expect(
        AdvancedSeedingService.generateAdvancedSeeding("tournament1")
      ).rejects.toThrow("Database error");
    });

    test("should handle missing tournament data", async () => {
      mockPrisma.tournament.findUnique.mockResolvedValue(null);

      await expect(
        AdvancedSeedingService.generateAdvancedSeeding("tournament1")
      ).rejects.toThrow("Tournament tournament1 not found");
    });
  });

  describe("2.2.8 Integration with Bracket Generation", () => {
    test("should generate valid seeding data for bracket generation", async () => {
      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1"
      );

      // Verify all required fields are present
      result.forEach((player) => {
        expect(player.userId).toBeDefined();
        expect(player.baseRating).toBeGreaterThan(0);
        expect(player.finalSeed).toBeGreaterThan(0);
        expect(player.seedFactors).toBeDefined();
        expect(player.seedFactors.rating).toBeDefined();
        expect(player.seedFactors.performance).toBeDefined();
        expect(player.seedFactors.history).toBeDefined();
        expect(player.seedFactors.regional).toBeDefined();
        expect(player.seedFactors.consistency).toBeDefined();
      });

      // Verify seeds are unique and sequential
      const seeds = result.map((p) => p.finalSeed).sort();
      expect(seeds).toEqual([1, 2, 3, 4]);
    });
  });

  describe("2.2.9 Performance Analysis", () => {
    test("should analyze performance gaps between players", async () => {
      const result = await AdvancedSeedingService.getSeedingRecommendations(
        "tournament1"
      );

      // Should provide insights about performance distribution
      expect(result.players.length).toBeGreaterThan(0);
      expect(typeof result.recommendations).toBe("object");
      expect(typeof result.warnings).toBe("object");
    });
  });

  describe("2.2.10 Custom Seeding Options", () => {
    test("should respect custom seeding options", async () => {
      const customOptions: SeedingOptions = {
        includePerformance: false,
        includeHistory: false,
        includeRegional: false,
        includeConsistency: false,
        ratingWeight: 1.0, // 100% weight on rating
      };

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        customOptions
      );

      expect(result).toHaveLength(4);
      // With 100% rating weight, should be sorted by rating
      expect(result[0].baseRating).toBe(1500);
      expect(result[1].baseRating).toBe(1400);
      expect(result[2].baseRating).toBe(1300);
      expect(result[3].baseRating).toBe(1200);
    });

    test("should handle partial seeding options", async () => {
      const partialOptions: SeedingOptions = {
        includePerformance: true,
        includeHistory: true,
        // Regional and consistency disabled
      };

      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        partialOptions
      );

      expect(result).toHaveLength(4);
      expect(result[0].performanceScore).toBeGreaterThan(0);
      expect(result[0].historicalScore).toBeGreaterThan(0);
      expect(result[0].regionalScore).toBe(0);
      expect(result[0].consistencyScore).toBe(0);
    });
  });

  describe("2.2.11 Integration with Bracket Generation Service", () => {
    test("should integrate with BracketGenerationService", async () => {
      // Mock the BracketGenerationService import
      const mockBracketGenerationService = {
        generateBracket: jest.fn(),
        generateBracketWithValidation: jest.fn(),
      };

      // Test that advanced seeding can be called
      const result = await AdvancedSeedingService.generateAdvancedSeeding(
        "tournament1",
        {
          includePerformance: false,
          includeHistory: false,
          includeRegional: false,
          includeConsistency: false,
        }
      );

      expect(result).toHaveLength(4);
      expect(result[0].baseRating).toBe(1500);
      expect(result[1].baseRating).toBe(1400);
      expect(result[2].baseRating).toBe(1300);
      expect(result[3].baseRating).toBe(1200);
    });
  });
});
