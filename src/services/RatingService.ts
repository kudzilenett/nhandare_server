import { prisma } from "../config/database";
import { Match, User, GameStatistic } from "@prisma/client";

export interface RatingUpdate {
  userId: string;
  gameId: string;
  oldRating: number;
  newRating: number;
  ratingChange: number;
  matchId: string;
  opponentRating: number;
  result: "win" | "loss" | "draw";
  kFactor: number;
  expectedScore: number;
  actualScore: number;
}

export interface RatingHistory {
  userId: string;
  gameId: string;
  rating: number;
  ratingChange: number;
  matchId: string;
  opponentRating: number;
  result: string;
  timestamp: Date;
}

export class RatingService {
  // Standard ELO rating system constants
  static BASE_RATING = 1200;
  static MAX_RATING = 3000;
  static MIN_RATING = 100;

  // K-factor determines how much ratings change per game
  // Higher K = more volatile ratings, Lower K = more stable ratings
  static K_FACTORS = {
    BEGINNER: 40, // New players (0-30 games)
    INTERMEDIATE: 20, // Developing players (31-100 games)
    MASTER: 10, // Experienced players (100+ games)
    TOURNAMENT: 32, // Tournament games (bonus multiplier)
  };

  // Rating thresholds for K-factor determination
  static RATING_THRESHOLDS = {
    BEGINNER: 30, // Games played
    INTERMEDIATE: 100, // Games played
    MASTER: 100, // Games played
  };

  /**
   * Update player ratings after a tournament match
   */
  static async updateTournamentRatings(tournamentId: string): Promise<void> {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        status: "COMPLETED",
        result: { in: ["PLAYER1_WIN", "PLAYER2_WIN", "DRAW"] },
      },
      include: {
        player1: true,
        player2: true,
        tournament: { select: { gameId: true } },
      },
    });

    for (const match of matches) {
      if (match.winnerId) {
        await this.updatePlayerRatings(match);
      }
    }
  }

  /**
   * Update ratings for a single match
   */
  private static async updatePlayerRatings(
    match: Match & {
      player1: User;
      player2: User;
      tournament: { gameId: string };
    }
  ): Promise<void> {
    const gameId = match.tournament.gameId;

    // Get current ratings
    const player1Rating = await this.getPlayerRating(match.player1Id, gameId);
    const player2Rating = await this.getPlayerRating(match.player2Id, gameId);

    // Determine match result
    const result = this.getMatchResult(match);

    // Calculate new ratings
    const player1Update = await this.calculateRatingUpdate(
      match.player1Id,
      gameId,
      player1Rating,
      player2Rating,
      result.player1Result,
      match.id,
      true // isTournament
    );

    const player2Update = await this.calculateRatingUpdate(
      match.player2Id,
      gameId,
      player2Rating,
      player1Rating,
      result.player2Result,
      match.id,
      true // isTournament
    );

    // Apply rating updates
    await this.applyRatingUpdate(player1Update);
    await this.applyRatingUpdate(player2Update);

    // Log rating history
    await this.logRatingHistory(player1Update);
    await this.logRatingHistory(player2Update);
  }

  /**
   * Get current player rating for a specific game
   */
  private static async getPlayerRating(
    userId: string,
    gameId: string
  ): Promise<number> {
    const stats = await prisma.gameStatistic.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });

    return stats?.currentRating || this.BASE_RATING;
  }

  /**
   * Determine match result for both players
   */
  private static getMatchResult(match: Match): {
    player1Result: "win" | "loss" | "draw";
    player2Result: "win" | "loss" | "draw";
  } {
    if (match.result === "DRAW") {
      return { player1Result: "draw", player2Result: "draw" };
    }

    if (match.winnerId === match.player1Id) {
      return { player1Result: "win", player2Result: "loss" };
    } else {
      return { player1Result: "loss", player2Result: "win" };
    }
  }

  /**
   * Calculate rating update using ELO formula
   */
  private static async calculateRatingUpdate(
    userId: string,
    gameId: string,
    playerRating: number,
    opponentRating: number,
    result: "win" | "loss" | "draw",
    matchId: string,
    isTournament: boolean = false
  ): Promise<RatingUpdate> {
    // Calculate expected score
    const expectedScore = this.calculateExpectedScore(
      playerRating,
      opponentRating
    );

    // Determine actual score
    const actualScore = this.getActualScore(result);

    // Get K-factor
    const kFactor = await this.getKFactor(userId, gameId, isTournament);

    // Calculate rating change
    const ratingChange = Math.round(kFactor * (actualScore - expectedScore));

    // Calculate new rating
    const newRating = Math.max(
      this.MIN_RATING,
      Math.min(this.MAX_RATING, playerRating + ratingChange)
    );

    return {
      userId,
      gameId,
      oldRating: playerRating,
      newRating,
      ratingChange,
      matchId,
      opponentRating,
      result,
      kFactor,
      expectedScore,
      actualScore,
    };
  }

  /**
   * Calculate expected score using ELO formula
   */
  private static calculateExpectedScore(
    playerRating: number,
    opponentRating: number
  ): number {
    const ratingDifference = opponentRating - playerRating;
    return 1 / (1 + Math.pow(10, ratingDifference / 400));
  }

  /**
   * Get actual score based on match result
   */
  private static getActualScore(result: "win" | "loss" | "draw"): number {
    switch (result) {
      case "win":
        return 1;
      case "loss":
        return 0;
      case "draw":
        return 0.5;
      default:
        return 0;
    }
  }

  /**
   * Get K-factor for rating calculation
   */
  private static async getKFactor(
    userId: string,
    gameId: string,
    isTournament: boolean = false
  ): Promise<number> {
    const stats = await prisma.gameStatistic.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });

    const gamesPlayed = stats?.gamesPlayed || 0;
    let baseKFactor: number;

    // Determine base K-factor based on experience
    if (gamesPlayed <= this.RATING_THRESHOLDS.BEGINNER) {
      baseKFactor = this.K_FACTORS.BEGINNER;
    } else if (gamesPlayed <= this.RATING_THRESHOLDS.INTERMEDIATE) {
      baseKFactor = this.K_FACTORS.INTERMEDIATE;
    } else {
      baseKFactor = this.K_FACTORS.MASTER;
    }

    // Apply tournament bonus multiplier
    if (isTournament) {
      baseKFactor = Math.round(
        baseKFactor * (this.K_FACTORS.TOURNAMENT / this.K_FACTORS.INTERMEDIATE)
      );
    }

    return baseKFactor;
  }

  /**
   * Apply rating update to player statistics
   */
  private static async applyRatingUpdate(update: RatingUpdate): Promise<void> {
    await prisma.gameStatistic.upsert({
      where: {
        userId_gameId: { userId: update.userId, gameId: update.gameId },
      },
      update: {
        currentRating: update.newRating,
        peakRating: { set: Math.max(update.newRating, update.oldRating) },
        gamesPlayed: { increment: 1 },
        gamesWon: { increment: update.result === "win" ? 1 : 0 },
        gamesLost: { increment: update.result === "loss" ? 1 : 0 },
        gamesDrawn: { increment: update.result === "draw" ? 1 : 0 },
      },
      create: {
        userId: update.userId,
        gameId: update.gameId,
        currentRating: update.newRating,
        peakRating: update.newRating,
        gamesPlayed: 1,
        gamesWon: update.result === "win" ? 1 : 0,
        gamesLost: update.result === "loss" ? 1 : 0,
        gamesDrawn: update.result === "draw" ? 1 : 0,
        winRate: update.result === "win" ? 1 : 0,
        averageScore: 0,
        bestScore: 0,
        totalPlayTime: 0,
      },
    });
  }

  /**
   * Log rating history for tracking
   */
  private static async logRatingHistory(update: RatingUpdate): Promise<void> {
    // This would typically go to a separate rating_history table
    // For now, we'll log it to console
    console.log(
      `Rating Update: ${update.userId} ${update.gameId} ${
        update.oldRating
      } -> ${update.newRating} (${update.ratingChange > 0 ? "+" : ""}${
        update.ratingChange
      })`
    );
  }

  /**
   * Get player rating history
   */
  static async getPlayerRatingHistory(
    userId: string,
    gameId: string,
    limit: number = 50
  ): Promise<RatingHistory[]> {
    // This would query a rating_history table
    // For now, return empty array
    return [];
  }

  /**
   * Get player rating progression
   */
  static async getPlayerRatingProgression(
    userId: string,
    gameId: string
  ): Promise<{
    currentRating: number;
    peakRating: number;
    gamesPlayed: number;
    winRate: number;
    ratingTrend: "rising" | "falling" | "stable";
    recentChange: number;
  }> {
    const stats = await prisma.gameStatistic.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });

    if (!stats) {
      return {
        currentRating: this.BASE_RATING,
        peakRating: this.BASE_RATING,
        gamesPlayed: 0,
        winRate: 0,
        ratingTrend: "stable",
        recentChange: 0,
      };
    }

    // Calculate rating trend based on recent games
    const recentChange = await this.getRecentRatingChange(userId, gameId);

    let ratingTrend: "rising" | "falling" | "stable" = "stable";
    if (recentChange > 10) ratingTrend = "rising";
    else if (recentChange < -10) ratingTrend = "falling";

    return {
      currentRating: stats.currentRating,
      peakRating: stats.peakRating,
      gamesPlayed: stats.gamesPlayed,
      winRate: stats.winRate,
      ratingTrend,
      recentChange,
    };
  }

  /**
   * Get recent rating change (last 10 games)
   */
  private static async getRecentRatingChange(
    userId: string,
    gameId: string
  ): Promise<number> {
    // This would calculate rating change from recent games
    // For now, return 0
    return 0;
  }

  /**
   * Calculate tournament seeding based on ratings
   */
  static async calculateTournamentSeeding(tournamentId: string): Promise<
    Array<{
      userId: string;
      username: string;
      rating: number;
      seed: number;
    }>
  > {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      include: {
        user: true,
        tournament: { select: { gameId: true } },
      },
    });

    const seededPlayers = [];

    for (const player of players) {
      const rating = await this.getPlayerRating(
        player.userId,
        player.tournament.gameId
      );

      seededPlayers.push({
        userId: player.userId,
        username: player.user.username,
        rating,
        seed: 0, // Will be set after sorting
      });
    }

    // Sort by rating (highest first) and assign seeds
    seededPlayers.sort((a, b) => b.rating - a.rating);

    seededPlayers.forEach((player, index) => {
      player.seed = index + 1;
    });

    return seededPlayers;
  }

  /**
   * Get rating distribution for a game
   */
  static async getRatingDistribution(gameId: string): Promise<{
    totalPlayers: number;
    averageRating: number;
    ratingRanges: Array<{
      range: string;
      count: number;
      percentage: number;
    }>;
  }> {
    const stats = await prisma.gameStatistic.findMany({
      where: { gameId },
    });

    if (stats.length === 0) {
      return {
        totalPlayers: 0,
        averageRating: 0,
        ratingRanges: [],
      };
    }

    const totalPlayers = stats.length;
    const averageRating = Math.round(
      stats.reduce((sum, stat) => sum + stat.currentRating, 0) / totalPlayers
    );

    // Define rating ranges
    const ranges = [
      { min: 0, max: 999, label: "0-999" },
      { min: 1000, max: 1199, label: "1000-1199" },
      { min: 1200, max: 1399, label: "1200-1399" },
      { min: 1400, max: 1599, label: "1400-1599" },
      { min: 1600, max: 1799, label: "1600-1799" },
      { min: 1800, max: 1999, label: "1800-1999" },
      { min: 2000, max: 9999, label: "2000+" },
    ];

    const ratingRanges = ranges.map((range) => {
      const count = stats.filter(
        (stat) =>
          stat.currentRating >= range.min && stat.currentRating <= range.max
      ).length;

      return {
        range: range.label,
        count,
        percentage: Math.round((count / totalPlayers) * 100),
      };
    });

    return {
      totalPlayers,
      averageRating,
      ratingRanges,
    };
  }
}
