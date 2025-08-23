import { prisma } from "../config/database";
import { RatingService } from "./RatingService";

export interface PlayerSeedingData {
  userId: string;
  baseRating: number;
  performanceScore: number;
  historicalScore: number;
  regionalScore: number;
  consistencyScore: number;
  finalSeed: number;
  seedFactors: {
    rating: number;
    performance: number;
    history: number;
    regional: number;
    consistency: number;
  };
}

export interface SeedingOptions {
  includePerformance?: boolean;
  includeHistory?: boolean;
  includeRegional?: boolean;
  includeConsistency?: boolean;
  performanceWeight?: number;
  historyWeight?: number;
  regionalWeight?: number;
  consistencyWeight?: number;
  ratingWeight?: number;
  recentTournaments?: number;
  regionalRadius?: number; // in kilometers
}

export class AdvancedSeedingService {
  // Default weights for different seeding factors
  private static readonly DEFAULT_WEIGHTS = {
    ratingWeight: 0.4, // 40% - Base rating
    performanceWeight: 0.25, // 25% - Recent performance
    historyWeight: 0.2, // 20% - Tournament history
    regionalWeight: 0.1, // 10% - Regional considerations
    consistencyWeight: 0.05, // 5% - Performance consistency
  };

  /**
   * Generate advanced seeding for tournament players
   */
  static async generateAdvancedSeeding(
    tournamentId: string,
    options: SeedingOptions = {}
  ): Promise<PlayerSeedingData[]> {
    try {
      // Get tournament details
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
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
      });

      if (!tournament) {
        throw new Error(`Tournament ${tournamentId} not found`);
      }

      // Get all players with their data
      const players = tournament.players;
      const seedingData: PlayerSeedingData[] = [];

      for (const player of players) {
        const playerData = await this.calculatePlayerSeedingData(
          player.user.id,
          tournament.gameId,
          options
        );
        seedingData.push(playerData);
      }

      // Sort by final seed score and assign seed numbers
      return seedingData
        .sort((a, b) => b.finalSeed - a.finalSeed)
        .map((player, index) => ({
          ...player,
          finalSeed: index + 1,
        }));
    } catch (error) {
      // Log the error for monitoring
      console.error(
        `Advanced seeding failed for tournament ${tournamentId}:`,
        error
      );

      // Re-throw the error to be handled by the fallback mechanism
      throw new Error(
        `Advanced seeding failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Calculate comprehensive seeding data for a single player
   */
  private static async calculatePlayerSeedingData(
    userId: string,
    gameId: string,
    options: SeedingOptions
  ): Promise<PlayerSeedingData> {
    const weights = {
      ...this.DEFAULT_WEIGHTS,
      ...options,
    } as Required<SeedingOptions>;

    // Get base rating
    const baseRating = await this.getPlayerRating(userId, gameId);

    // Calculate performance score
    const performanceScore =
      options.includePerformance === true
        ? await this.calculatePerformanceScore(
            userId,
            gameId,
            options.recentTournaments || 5
          )
        : 0;

    // Calculate historical score
    const historicalScore =
      options.includeHistory === true
        ? await this.calculateHistoricalScore(
            userId,
            gameId,
            options.recentTournaments || 10
          )
        : 0;

    // Calculate regional score
    const regionalScore =
      options.includeRegional === true
        ? await this.calculateRegionalScore(
            userId,
            gameId,
            options.regionalRadius || 100
          )
        : 0;

    // Calculate consistency score
    const consistencyScore =
      options.includeConsistency === true
        ? await this.calculateConsistencyScore(userId, gameId)
        : 0;

    // Calculate final seed score
    const finalSeed = this.calculateFinalSeedScore(
      baseRating,
      performanceScore,
      historicalScore,
      regionalScore,
      consistencyScore,
      weights
    );

    return {
      userId,
      baseRating,
      performanceScore,
      historicalScore,
      regionalScore,
      consistencyScore,
      finalSeed,
      seedFactors: {
        rating: baseRating,
        performance: performanceScore,
        history: historicalScore,
        regional: regionalScore,
        consistency: consistencyScore,
      },
    };
  }

  /**
   * Get player's current rating
   */
  private static async getPlayerRating(
    userId: string,
    gameId: string
  ): Promise<number> {
    const stats = await prisma.gameStatistic.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });
    return stats?.currentRating || RatingService.BASE_RATING;
  }

  /**
   * Calculate performance score based on recent matches
   */
  private static async calculatePerformanceScore(
    userId: string,
    gameId: string,
    recentMatches: number = 5
  ): Promise<number> {
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ player1Id: userId }, { player2Id: userId }],
        gameId,
        status: "COMPLETED",
        result: { in: ["PLAYER1_WIN", "PLAYER2_WIN", "DRAW"] },
      },
      orderBy: { createdAt: "desc" },
      take: recentMatches,
      include: {
        player1: {
          include: {
            gameStats: true,
          },
        },
        player2: {
          include: {
            gameStats: true,
          },
        },
      },
    });

    if (matches.length === 0) return 0;

    let totalScore = 0;
    let matchCount = 0;

    for (const match of matches) {
      const isPlayer1 = match.player1Id === userId;
      const opponent = isPlayer1 ? match.player2 : match.player1;
      const opponentRating =
        opponent.gameStats?.[0]?.currentRating || RatingService.BASE_RATING;

      let matchScore = 0;
      if (match.result === "DRAW") {
        matchScore = 0.5;
      } else if (
        (isPlayer1 && match.result === "PLAYER1_WIN") ||
        (!isPlayer1 && match.result === "PLAYER2_WIN")
      ) {
        matchScore = 1.0;
      }

      // Bonus for beating higher-rated opponents
      const ratingBonus = Math.max(
        0,
        (opponentRating - RatingService.BASE_RATING) / 1000
      );
      totalScore += matchScore + ratingBonus;
      matchCount++;
    }

    return matchCount > 0 ? (totalScore / matchCount) * 1000 : 0;
  }

  /**
   * Calculate historical score based on tournament performance
   */
  private static async calculateHistoricalScore(
    userId: string,
    gameId: string,
    recentTournaments: number = 10
  ): Promise<number> {
    const tournaments = await prisma.tournament.findMany({
      where: {
        gameId,
        players: { some: { userId } },
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
      take: recentTournaments,
      include: {
        matches: {
          where: {
            OR: [{ player1Id: userId }, { player2Id: userId }],
            status: "COMPLETED",
          },
        },
      },
    });

    if (tournaments.length === 0) return 0;

    let totalScore = 0;
    let tournamentCount = 0;

    for (const tournament of tournaments) {
      if (tournament.matches.length === 0) continue;

      let tournamentScore = 0;
      let matchCount = 0;

      for (const match of tournament.matches) {
        const isPlayer1 = match.player1Id === userId;
        let matchScore = 0;

        if (match.result === "DRAW") {
          matchScore = 0.5;
        } else if (
          (isPlayer1 && match.result === "PLAYER1_WIN") ||
          (!isPlayer1 && match.result === "PLAYER2_WIN")
        ) {
          matchScore = 1.0;
        }

        tournamentScore += matchScore;
        matchCount++;
      }

      if (matchCount > 0) {
        totalScore += (tournamentScore / matchCount) * 1000;
        tournamentCount++;
      }
    }

    return tournamentCount > 0 ? totalScore / tournamentCount : 0;
  }

  /**
   * Calculate regional score based on player location
   */
  private static async calculateRegionalScore(
    userId: string,
    gameId: string,
    regionalRadius: number = 100
  ): Promise<number> {
    // Get player's location from User model
    const player = await prisma.user.findUnique({
      where: { id: userId },
      select: { latitude: true, longitude: true },
    });

    if (!player?.latitude || !player?.longitude) {
      return 0; // No location data
    }

    // Find nearby players in recent tournaments
    const nearbyPlayers = await prisma.user.findMany({
      where: {
        id: { not: userId },
        latitude: {
          gte: player.latitude - regionalRadius / 111, // Rough conversion to degrees
          lte: player.latitude + regionalRadius / 111,
        },
        longitude: {
          gte:
            player.longitude -
            regionalRadius /
              (111 * Math.cos((player.latitude * Math.PI) / 180)),
          lte:
            player.longitude +
            regionalRadius /
              (111 * Math.cos((player.latitude * Math.PI) / 180)),
        },
      },
      select: { id: true },
    });

    if (nearbyPlayers.length === 0) return 0;

    // Calculate regional strength based on nearby player ratings
    let totalRating = 0;
    let playerCount = 0;

    for (const nearbyPlayer of nearbyPlayers) {
      const rating = await this.getPlayerRating(nearbyPlayer.id, gameId);
      totalRating += rating;
      playerCount++;
    }

    const averageRegionalRating =
      playerCount > 0 ? totalRating / playerCount : 0;

    // Regional score based on local competition strength
    return Math.max(
      0,
      (averageRegionalRating - RatingService.BASE_RATING) / 10
    );
  }

  /**
   * Calculate consistency score based on rating stability
   * Since we don't have rating history, we'll use win rate consistency as a proxy
   */
  private static async calculateConsistencyScore(
    userId: string,
    gameId: string
  ): Promise<number> {
    const gameStats = await prisma.gameStatistic.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });

    if (!gameStats || gameStats.gamesPlayed < 5) return 0;

    // Use win rate as a proxy for consistency
    // Players with win rates closer to 0.5 (50%) are more consistent
    const winRate = gameStats.winRate;
    const consistencyFromWinRate = Math.abs(0.5 - winRate);

    // Convert to consistency score (closer to 0.5 = higher consistency)
    const consistencyScore = Math.max(0, (1 - consistencyFromWinRate) * 1000);

    return consistencyScore;
  }

  /**
   * Calculate final seed score using weighted factors
   */
  private static calculateFinalSeedScore(
    rating: number,
    performance: number,
    history: number,
    regional: number,
    consistency: number,
    weights: Required<SeedingOptions>
  ): number {
    // Normalize all scores to 0-1000 range
    const normalizedRating = Math.min(
      1000,
      ((rating - RatingService.MIN_RATING) /
        (RatingService.MAX_RATING - RatingService.MIN_RATING)) *
        1000
    );
    const normalizedPerformance = Math.min(1000, performance);
    const normalizedHistory = Math.min(1000, history);
    const normalizedRegional = Math.min(1000, Math.max(0, regional + 500)); // Center around 500
    const normalizedConsistency = Math.min(1000, consistency);

    // Calculate weighted final score
    return (
      normalizedRating * weights.ratingWeight +
      normalizedPerformance * weights.performanceWeight +
      normalizedHistory * weights.historyWeight +
      normalizedRegional * weights.regionalWeight +
      normalizedConsistency * weights.consistencyWeight
    );
  }

  /**
   * Get seeding recommendations for tournament organizers
   */
  static async getSeedingRecommendations(
    tournamentId: string,
    options: SeedingOptions = {}
  ): Promise<{
    players: PlayerSeedingData[];
    recommendations: string[];
    warnings: string[];
  }> {
    const players = await this.generateAdvancedSeeding(tournamentId, options);
    const recommendations: string[] = [];
    const warnings: string[] = [];

    // Analyze seeding distribution
    const ratingRanges = this.analyzeRatingDistribution(players);
    const performanceGaps = this.analyzePerformanceGaps(players);

    // Generate recommendations
    if (ratingRanges.largeGap) {
      recommendations.push(
        "Consider splitting tournament into divisions based on rating ranges"
      );
    }

    if (performanceGaps.significant) {
      recommendations.push(
        "Some players may be under/over-seeded based on recent performance"
      );
    }

    // Check for seeding anomalies
    players.forEach((player, index) => {
      const expectedSeed = index + 1;
      const ratingSeed =
        players.findIndex((p) => p.baseRating === player.baseRating) + 1;

      if (Math.abs(expectedSeed - ratingSeed) > 2) {
        warnings.push(
          `Player ${player.userId} may be significantly under/over-seeded`
        );
      }
    });

    return {
      players,
      recommendations,
      warnings,
    };
  }

  /**
   * Analyze rating distribution across seeded players
   */
  private static analyzeRatingDistribution(players: PlayerSeedingData[]): {
    largeGap: boolean;
    averageGap: number;
  } {
    if (players.length < 2) return { largeGap: false, averageGap: 0 };

    let totalGap = 0;
    let gapCount = 0;

    for (let i = 1; i < players.length; i++) {
      const gap = Math.abs(players[i - 1].baseRating - players[i].baseRating);
      totalGap += gap;
      gapCount++;
    }

    const averageGap = gapCount > 0 ? totalGap / gapCount : 0;
    const largeGap = averageGap > 200; // Gap of 200+ rating points

    return { largeGap, averageGap };
  }

  /**
   * Analyze performance gaps between seeded players
   */
  private static analyzePerformanceGaps(players: PlayerSeedingData[]): {
    significant: boolean;
    averageGap: number;
  } {
    if (players.length < 2) return { significant: false, averageGap: 0 };

    let totalGap = 0;
    let gapCount = 0;

    for (let i = 1; i < players.length; i++) {
      const gap = Math.abs(
        players[i - 1].performanceScore - players[i].performanceScore
      );
      totalGap += gap;
      gapCount++;
    }

    const averageGap = gapCount > 0 ? totalGap / gapCount : 0;
    const significant = averageGap > 300; // Gap of 300+ performance points

    return { significant, averageGap };
  }
}
