import { describe, test, expect } from "@jest/globals";
import {
  BracketGenerationService,
  BracketStructure,
  BracketValidationResult,
} from "../src/services/BracketGenerationService";

describe("Bracket System Phase 1 - Critical Fixes", () => {
  const mockPlayers = [
    {
      userId: "player1",
      seedNumber: 1,
      rating: 1500,
      registeredAt: new Date(),
    },
    {
      userId: "player2",
      seedNumber: 2,
      rating: 1400,
      registeredAt: new Date(),
    },
    {
      userId: "player3",
      seedNumber: 3,
      rating: 1300,
      registeredAt: new Date(),
    },
    {
      userId: "player4",
      seedNumber: 4,
      rating: 1200,
      registeredAt: new Date(),
    },
    {
      userId: "player5",
      seedNumber: 5,
      rating: 1100,
      registeredAt: new Date(),
    },
    {
      userId: "player6",
      seedNumber: 6,
      rating: 1000,
      registeredAt: new Date(),
    },
    { userId: "player7", seedNumber: 7, rating: 900, registeredAt: new Date() },
    { userId: "player8", seedNumber: 8, rating: 800, registeredAt: new Date() },
  ];

  describe("1.1 Complete Double Elimination Implementation", () => {
    test("should generate proper double elimination bracket structure", () => {
      const bracket =
        BracketGenerationService["generateDoubleElimination"](mockPlayers);

      expect(bracket.type).toBe("DOUBLE_ELIMINATION");
      expect(bracket.totalRounds).toBeGreaterThan(0);
      expect(bracket.rounds.length).toBeGreaterThan(0);

      // Should have winners bracket rounds
      const winnersRounds = bracket.rounds.filter(
        (round) => round.matches[0]?.bracketType === "winners"
      );
      expect(winnersRounds.length).toBeGreaterThan(0);

      // Should have losers bracket rounds
      const losersRounds = bracket.rounds.filter(
        (round) => round.matches[0]?.bracketType === "losers"
      );
      expect(losersRounds.length).toBeGreaterThan(0);

      // Should have grand finals
      const grandFinals = bracket.rounds.filter(
        (round) => round.matches[0]?.bracketType === "grand_finals"
      );
      expect(grandFinals.length).toBe(1);
    });

    test("should properly link double elimination progression", () => {
      const bracket =
        BracketGenerationService["generateDoubleElimination"](mockPlayers);

      // Winners bracket should have proper progression
      const winnersRounds = bracket.rounds.filter(
        (round) => round.matches[0]?.bracketType === "winners"
      );

      for (let i = 0; i < winnersRounds.length - 1; i++) {
        const currentRound = winnersRounds[i];
        const nextRound = winnersRounds[i + 1];

        currentRound.matches.forEach((match) => {
          if (match.nextMatchId) {
            expect(match.nextMatchId).toMatch(/^winners_\d+_\d+$/);
          }
        });
      }

      // Losers bracket should have proper progression
      const losersRounds = bracket.rounds.filter(
        (round) => round.matches[0]?.bracketType === "losers"
      );

      for (let i = 0; i < losersRounds.length - 1; i++) {
        const currentRound = losersRounds[i];
        const nextRound = losersRounds[i + 1];

        currentRound.matches.forEach((match) => {
          if (match.nextMatchId) {
            expect(match.nextMatchId).toMatch(/^losers_\d+_\d+$/);
          }
        });
      }
    });

    test("should handle odd player counts correctly", () => {
      const oddPlayers = mockPlayers.slice(0, 7); // 7 players
      const bracket =
        BracketGenerationService["generateDoubleElimination"](oddPlayers);

      // Should still generate valid bracket structure
      expect(bracket.type).toBe("DOUBLE_ELIMINATION");
      expect(bracket.rounds.length).toBeGreaterThan(0);
    });
  });

  describe("1.2 Fix Bracket Progression Logic", () => {
    test("should calculate proper progression paths", () => {
      const progressionPath = BracketGenerationService[
        "calculateProgressionPath"
      ](0, 4, 2);

      expect(progressionPath.isValid).toBe(true);
      expect(progressionPath.nextMatchIndex).toBe(0);
      expect(progressionPath.slot).toBe(1);
    });

    test("should handle edge cases in progression", () => {
      const progressionPath = BracketGenerationService[
        "calculateProgressionPath"
      ](0, 4, 0);

      expect(progressionPath.isValid).toBe(false);
      expect(progressionPath.nextMatchIndex).toBe(-1);
      expect(progressionPath.slot).toBe(-1);
    });

    test("should properly link single elimination progression", () => {
      const bracket =
        BracketGenerationService["generateSingleElimination"](mockPlayers);

      // All matches should have proper nextMatchId
      for (let i = 0; i < bracket.rounds.length - 1; i++) {
        const currentRound = bracket.rounds[i];
        const nextRound = bracket.rounds[i + 1];

        currentRound.matches.forEach((match) => {
          if (match.nextMatchId) {
            expect(match.nextMatchId).toMatch(/^round\d+_match\d+$/);
          }
        });
      }
    });
  });

  describe("1.3 Implement Proper Bye Handling", () => {
    test("should calculate optimal bracket size", () => {
      const bracketSize4 = BracketGenerationService["calculateBracketSize"](4);
      expect(bracketSize4).toBe(4);

      const bracketSize5 = BracketGenerationService["calculateBracketSize"](5);
      expect(bracketSize5).toBe(8);

      const bracketSize7 = BracketGenerationService["calculateBracketSize"](7);
      expect(bracketSize7).toBe(8);
    });

    test("should calculate fair bye distribution", () => {
      const byeDistribution5 = BracketGenerationService[
        "calculateByeDistribution"
      ](5, 8);
      expect(byeDistribution5).toEqual([7, 6, 5]);

      const byeDistribution7 = BracketGenerationService[
        "calculateByeDistribution"
      ](7, 8);
      expect(byeDistribution7).toEqual([7]);
    });

    test("should generate first round matches with proper bye handling", () => {
      const bracketSize = 8;
      const byeDistribution = [7, 6, 5];
      const firstRoundMatches = BracketGenerationService[
        "generateFirstRoundMatches"
      ](mockPlayers.slice(0, 5), bracketSize, byeDistribution);

      expect(firstRoundMatches.length).toBe(4);

      // Check that byes are properly assigned
      const byeMatches = firstRoundMatches.filter((match) => match.isBye);
      expect(byeMatches.length).toBe(3);

      byeMatches.forEach((match) => {
        expect(match.winnerId).toBeTruthy();
        expect(match.status).toBe("COMPLETED");
      });
    });

    test("should handle odd player counts with byes", () => {
      const oddPlayers = mockPlayers.slice(0, 5); // 5 players
      const bracket =
        BracketGenerationService["generateSingleElimination"](oddPlayers);

      // Should have 8 bracket size (3 byes)
      const firstRound = bracket.rounds[0];
      const byeMatches = firstRound.matches.filter((match) => match.isBye);
      expect(byeMatches.length).toBe(3);
    });
  });

  describe("1.4 Add Bracket Validation", () => {
    test("should validate bracket integrity", () => {
      const bracket =
        BracketGenerationService["generateSingleElimination"](mockPlayers);
      const validation = BracketGenerationService["validateBracket"](bracket);

      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);
      expect(validation.details.totalMatches).toBeGreaterThan(0);
      expect(validation.details.totalRounds).toBeGreaterThan(0);
    });

    test("should detect bracket structure issues", () => {
      const invalidBracket: BracketStructure = {
        type: "SINGLE_ELIMINATION",
        rounds: [],
        totalRounds: 3,
        totalMatches: 0,
        players: mockPlayers,
        generatedAt: new Date(),
      };

      const validation =
        BracketGenerationService["validateBracket"](invalidBracket);
      expect(validation.isValid).toBe(false);
      expect(
        validation.errors.some((error) => error.includes("no rounds"))
      ).toBe(true);
    });

    test("should validate double elimination specific rules", () => {
      const bracket =
        BracketGenerationService["generateDoubleElimination"](mockPlayers);
      const validation = BracketGenerationService["validateBracket"](bracket);

      expect(validation.isValid).toBe(true);

      // Check that double elimination specific validation passed
      const doubleElimErrors = validation.errors.filter((error) =>
        error.includes("Double elimination")
      );
      expect(doubleElimErrors.length).toBe(0);
    });

    test("should validate bye distribution", () => {
      const oddPlayers = mockPlayers.slice(0, 5); // 5 players
      const bracket =
        BracketGenerationService["generateSingleElimination"](oddPlayers);
      const validation = BracketGenerationService["validateBracket"](bracket);

      expect(validation.isValid).toBe(true);
      expect(validation.details.byeCount).toBe(3); // 8 - 5 = 3 byes
    });
  });

  describe("Integration Tests", () => {
    test("should generate and validate complete double elimination bracket", () => {
      const bracket =
        BracketGenerationService["generateDoubleElimination"](mockPlayers);
      const validation = BracketGenerationService["validateBracket"](bracket);

      expect(validation.isValid).toBe(true);
      expect(bracket.type).toBe("DOUBLE_ELIMINATION");
      expect(bracket.rounds.length).toBeGreaterThan(0);

      // All rounds should have proper progression
      let progressionIssues = 0;
      for (let i = 0; i < bracket.rounds.length - 1; i++) {
        const currentRound = bracket.rounds[i];
        currentRound.matches.forEach((match) => {
          if (match.nextMatchId && !match.nextMatchId.includes("_")) {
            progressionIssues++;
          }
        });
      }

      expect(progressionIssues).toBe(0);
    });

    test("should handle various player counts correctly", () => {
      const playerCounts = [2, 4, 6, 8];

      playerCounts.forEach((count) => {
        const players = mockPlayers.slice(0, count);
        const bracket =
          BracketGenerationService["generateSingleElimination"](players);
        const validation = BracketGenerationService["validateBracket"](bracket);

        expect(validation.isValid).toBe(true);
        expect(bracket.players.length).toBe(count);
        // For odd player counts, we need to calculate the bracket size first
        const bracketSize =
          BracketGenerationService["calculateBracketSize"](count);
        expect(bracket.rounds.length).toBe(Math.ceil(Math.log2(bracketSize)));
      });
    });
  });
});
