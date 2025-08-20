import { prisma } from "../config/database";
import logger from "../config/logger";

export interface MatchmakingCriteria {
  rating: number;
  ratingRange: number; // ±75, ±150, ±300 (expands over time)
  maxWaitTime: number; // 20s, 45s, 90s (fast for small player base)
  gameMode: string;
}

export interface QueueTicket {
  id: string;
  position: number;
  estimatedWaitTime: number;
  totalInQueue: number;
}

export interface MatchResult {
  matchId?: string;
  color?: "white" | "black";
  isAiMatch?: boolean;
  aiDifficulty?: string;
  queueTicket?: QueueTicket;
}

export interface QueueStatus {
  position: number; // Your position in queue
  estimatedWaitTime: number; // Seconds until likely match
  totalInQueue: number; // Total players waiting
  averageWaitTime: number; // Historical average for this rating
}

/**
 * Enhanced Matchmaking Service for Zimbabwe Scale
 * - PostgreSQL-based queue for persistence
 * - Skill-based matching with expanding ranges
 * - AI fallback with appropriate difficulty
 * - Basic analytics tracking
 */
export class SkillBasedMatchmakingService {
  private io: any = null; // Socket.io instance

  /**
   * Set the Socket.io instance for WebSocket notifications
   */
  setSocketIO(io: any): void {
    this.io = io;
  }

  /**
   * Join matchmaking queue with skill-based criteria
   */
  async joinQueue(userId: string, gameType: string): Promise<QueueTicket> {
    // Get player's current rating for this game
    const userRating = await this.getUserRating(userId, gameType);

    // Remove any existing queue entries for this user (prevent duplicates)
    await prisma.matchmakingQueue.deleteMany({
      where: { userId, gameType },
    });

    // Add to queue
    const queueEntry = await prisma.matchmakingQueue.create({
      data: {
        userId,
        gameType,
        rating: userRating,
        status: "waiting",
      },
    });

    // Get queue position and estimates
    const queueStatus = await this.getQueueStatus(userId, gameType);

    logger.info("User joined matchmaking queue", {
      service: "skill-based-matchmaking",
      userId,
      gameType,
      rating: userRating,
      position: queueStatus.position,
    });

    return {
      id: queueEntry.id,
      position: queueStatus.position,
      estimatedWaitTime: queueStatus.estimatedWaitTime,
      totalInQueue: queueStatus.totalInQueue,
    };
  }

  /**
   * Leave matchmaking queue
   */
  async leaveQueue(userId: string, gameType?: string): Promise<void> {
    const whereClause: any = { userId };
    if (gameType) {
      whereClause.gameType = gameType;
    }

    await prisma.matchmakingQueue.deleteMany({
      where: whereClause,
    });

    logger.info("User left matchmaking queue", {
      service: "skill-based-matchmaking",
      userId,
      gameType,
    });
  }

  /**
   * Find match using skill-based algorithm with expanding ranges
   * Zimbabwe Strategy: ±75 → ±150 → ±300 → AI fallback
   */
  async findMatch(userId: string, gameType: string): Promise<MatchResult> {
    const userRating = await this.getUserRating(userId, gameType);

    // Check how long user has been waiting (if in queue)
    const existingEntry = await prisma.matchmakingQueue.findFirst({
      where: { userId, gameType, status: "waiting" },
    });

    const waitTime = existingEntry
      ? Date.now() - existingEntry.joinedAt.getTime()
      : 0;

    // Determine rating range based on wait time (Zimbabwe focus)
    let ratingRange: number;
    if (waitTime < 20000) {
      ratingRange = 75; // Initial: tight matching
    } else if (waitTime < 45000) {
      ratingRange = 150; // Medium: reasonable range
    } else if (waitTime < 90000) {
      ratingRange = 300; // Wide: accept larger differences
    } else {
      // Fallback to AI after 90 seconds
      await this.leaveQueue(userId, gameType);
      return this.createAiMatch(userId, gameType, userRating);
    }

    // Find suitable opponent in queue
    const opponent = await this.findOpponentInRange(
      userId,
      gameType,
      userRating,
      ratingRange
    );

    if (opponent) {
      // Create human vs human match
      const matchId = await this.createHumanMatch(
        userId,
        opponent.userId,
        gameType
      );

      // Remove both players from queue
      await prisma.matchmakingQueue.deleteMany({
        where: {
          userId: { in: [userId, opponent.userId] },
          gameType,
        },
      });

      // Track successful match
      await this.trackMatchSuccess(
        gameType,
        userRating,
        opponent.rating,
        waitTime,
        false
      );

      logger.info("Human match created", {
        service: "skill-based-matchmaking",
        player1: userId,
        player2: opponent.userId,
        gameType,
        ratingDiff: Math.abs(userRating - opponent.rating),
        waitTime,
      });

      return {
        matchId,
        color: "white", // Player who requested gets white
        isAiMatch: false,
      };
    }

    // No suitable opponent found - add to queue or return AI match
    if (!existingEntry) {
      const queueTicket = await this.joinQueue(userId, gameType);
      return { queueTicket };
    }

    // Already in queue, just return current status
    const queueStatus = await this.getQueueStatus(userId, gameType);
    return {
      queueTicket: {
        id: existingEntry.id,
        position: queueStatus.position,
        estimatedWaitTime: queueStatus.estimatedWaitTime,
        totalInQueue: queueStatus.totalInQueue,
      },
    };
  }

  /**
   * Get current queue status for a user
   */
  async getQueueStatus(userId: string, gameType: string): Promise<QueueStatus> {
    // Get user's position in queue (ordered by joinedAt)
    const allWaiting = await prisma.matchmakingQueue.findMany({
      where: { gameType, status: "waiting" },
      orderBy: { joinedAt: "asc" },
      select: { userId: true, rating: true, joinedAt: true },
    });

    const userIndex = allWaiting.findIndex((entry) => entry.userId === userId);
    const position = userIndex === -1 ? 0 : userIndex + 1;

    // Get historical average wait time for this rating range
    const averageWaitTime = await this.getAverageWaitTime(gameType);

    // Estimate wait time based on position and historical data
    const estimatedWaitTime = Math.max(
      0,
      (position - 1) * 15 + averageWaitTime
    );

    return {
      position,
      estimatedWaitTime,
      totalInQueue: allWaiting.length,
      averageWaitTime,
    };
  }

  /**
   * Find opponent within rating range
   */
  private async findOpponentInRange(
    userId: string,
    gameType: string,
    userRating: number,
    ratingRange: number
  ) {
    return prisma.matchmakingQueue.findFirst({
      where: {
        gameType,
        status: "waiting",
        userId: { not: userId },
        rating: {
          gte: userRating - ratingRange,
          lte: userRating + ratingRange,
        },
      },
      orderBy: { joinedAt: "asc" }, // First in queue gets matched
    });
  }

  /**
   * Get user's current rating for a game
   */
  private async getUserRating(
    userId: string,
    gameType: string
  ): Promise<number> {
    // Find the game ID
    const game = await prisma.game.findUnique({
      where: { name: gameType },
      select: { id: true },
    });

    if (!game) {
      logger.warn("Game not found, using default rating", { gameType });
      return 1200;
    }

    // Get user's rating for this game
    const stats = await prisma.gameStatistic.findUnique({
      where: {
        userId_gameId: {
          userId,
          gameId: game.id,
        },
      },
      select: { currentRating: true },
    });

    return stats?.currentRating || 1200; // Default rating for new players
  }

  /**
   * Create AI match with appropriate difficulty based on player rating
   */
  private async createAiMatch(
    userId: string,
    gameType: string,
    userRating: number
  ): Promise<MatchResult> {
    // Determine AI difficulty based on player rating (Zimbabwe focused)
    let aiDifficulty: string;
    if (userRating < 1300) {
      aiDifficulty = "easy";
    } else if (userRating < 1600) {
      aiDifficulty = "medium";
    } else {
      aiDifficulty = "hard";
    }

    const matchId = await this.createMatchRecord(
      gameType,
      userId,
      null,
      aiDifficulty
    );

    // Track AI fallback
    await this.trackMatchSuccess(gameType, userRating, 0, 90000, true);

    logger.info("AI match created with smart difficulty", {
      service: "skill-based-matchmaking",
      userId,
      gameType,
      userRating,
      aiDifficulty,
      reason: "no_human_opponents",
    });

    return {
      matchId,
      color: "white",
      isAiMatch: true,
      aiDifficulty, // Include in response for frontend
    };
  }

  /**
   * Create human vs human match
   */
  private async createHumanMatch(
    player1Id: string,
    player2Id: string,
    gameType: string
  ): Promise<string> {
    return this.createMatchRecord(gameType, player1Id, player2Id);
  }

  /**
   * Create match record in database
   */
  private async createMatchRecord(
    gameType: string,
    player1Id: string,
    player2Id: string | null,
    aiDifficulty?: string
  ): Promise<string> {
    const game = await prisma.game.findUnique({
      where: { name: gameType },
      select: { id: true },
    });

    if (!game) {
      throw new Error(`Game ${gameType} not found`);
    }

    // Prepare game data with AI difficulty if it's an AI match
    const gameData = player2Id
      ? {}
      : {
          aiDifficulty: aiDifficulty || "medium",
          isAiMatch: true,
        };

    const match = await prisma.match.create({
      data: {
        player1Id,
        player2Id: player2Id || "ai_player", // AI player placeholder
        gameId: game.id,
        status: "ACTIVE",
        gameData: gameData as any,
      },
    });

    return match.id;
  }

  /**
   * Track match success for analytics
   */
  private async trackMatchSuccess(
    gameType: string,
    userRating: number,
    opponentRating: number,
    waitTime: number,
    isAiMatch: boolean
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Update or create daily metrics
      await prisma.matchmakingMetrics.upsert({
        where: {
          gameType_date: {
            gameType,
            date: today,
          },
        },
        update: {
          totalMatches: { increment: 1 },
          aiMatches: { increment: isAiMatch ? 1 : 0 },
          humanMatches: { increment: isAiMatch ? 0 : 1 },
          averageWaitTime: Math.round(waitTime / 1000), // Convert to seconds
          averageRatingDifference: isAiMatch
            ? undefined
            : Math.abs(userRating - opponentRating),
        },
        create: {
          gameType,
          date: today,
          totalMatches: 1,
          aiMatches: isAiMatch ? 1 : 0,
          humanMatches: isAiMatch ? 0 : 1,
          averageWaitTime: Math.round(waitTime / 1000),
          averageRatingDifference: isAiMatch
            ? undefined
            : Math.abs(userRating - opponentRating),
          peakConcurrentUsers: 1,
        },
      });
    } catch (error) {
      logger.error("Failed to track match metrics", {
        error,
        gameType,
        isAiMatch,
      });
    }
  }

  /**
   * Get average wait time for historical estimates
   */
  private async getAverageWaitTime(gameType: string): Promise<number> {
    const recent = await prisma.matchmakingMetrics.findFirst({
      where: { gameType },
      orderBy: { date: "desc" },
      select: { averageWaitTime: true },
    });

    return recent?.averageWaitTime || 30; // Default 30 seconds
  }

  /**
   * Clean up abandoned queue entries (older than 10 minutes)
   */
  async cleanupAbandonedEntries(): Promise<void> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const deleted = await prisma.matchmakingQueue.deleteMany({
      where: {
        joinedAt: { lt: tenMinutesAgo },
        status: "waiting",
      },
    });

    if (deleted.count > 0) {
      logger.info("Cleaned up abandoned queue entries", {
        service: "skill-based-matchmaking",
        deletedCount: deleted.count,
      });
    }
  }
}

export default new SkillBasedMatchmakingService();
