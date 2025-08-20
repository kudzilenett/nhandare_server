import * as cron from "node-cron";
import SkillBasedMatchmakingService from "./SkillBasedMatchmakingService";
import { prisma } from "../config/database";
import logger from "../config/logger";

/**
 * Background Job for Matchmaking Queue Processing
 * - Runs every 5 seconds to process waiting players
 * - Attempts to match players based on skill and wait time
 * - Cleans up abandoned queue entries
 * - Optimized for Zimbabwe scale (few thousand players)
 */
export class MatchmakingBackgroundJob {
  private isRunning = false;
  private job: cron.ScheduledTask | null = null;
  private io: any = null; // Socket.io instance

  /**
   * Set the Socket.io instance for WebSocket notifications
   */
  setSocketIO(io: any): void {
    this.io = io;
    logger.info("Socket.io instance attached to matchmaking job");
  }

  /**
   * Start the background job
   */
  start(): void {
    if (this.job) {
      logger.warn("Matchmaking background job already running");
      return;
    }

    // Run every 5 seconds (fast matching for small player base)
    this.job = cron.schedule("*/5 * * * * *", async () => {
      if (this.isRunning) {
        logger.debug(
          "Skipping matchmaking job - previous execution still running"
        );
        return;
      }

      this.isRunning = true;
      try {
        await this.processQueue();
      } catch (error) {
        logger.error("Error in matchmaking background job", { error });
      } finally {
        this.isRunning = false;
      }
    });

    logger.info("Matchmaking background job started (5 second intervals)");
  }

  /**
   * Stop the background job
   */
  stop(): void {
    if (this.job) {
      this.job.destroy();
      this.job = null;
      logger.info("Matchmaking background job stopped");
    }
  }

  /**
   * Process all waiting players in queue
   */
  private async processQueue(): Promise<void> {
    try {
      // Get all unique game types with waiting players
      const gameTypes = await prisma.matchmakingQueue.findMany({
        where: { status: "waiting" },
        select: { gameType: true },
        distinct: ["gameType"],
      });

      // Process each game type separately
      for (const { gameType } of gameTypes) {
        await this.processGameTypeQueue(gameType);

        // Broadcast queue updates to waiting players
        await this.broadcastQueueUpdates(gameType);
      }

      // Clean up abandoned entries (every 5th run = ~25 seconds)
      if (Math.random() < 0.2) {
        await SkillBasedMatchmakingService.cleanupAbandonedEntries();
      }
    } catch (error) {
      logger.error("Error processing matchmaking queue", { error });
    }
  }

  /**
   * Process queue for a specific game type
   */
  private async processGameTypeQueue(gameType: string): Promise<void> {
    try {
      // Get all waiting players for this game type, ordered by join time
      const waitingPlayers = await prisma.matchmakingQueue.findMany({
        where: {
          gameType,
          status: "waiting",
        },
        orderBy: { joinedAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              gameStats: {
                where: {
                  game: { name: gameType },
                },
                select: { currentRating: true },
              },
            },
          },
        },
      });

      if (waitingPlayers.length < 2) {
        // Not enough players to make matches
        return;
      }

      logger.debug("Processing queue", {
        gameType,
        waitingCount: waitingPlayers.length,
      });

      // Try to match players using skill-based algorithm
      const matched = new Set<string>();

      for (let i = 0; i < waitingPlayers.length; i++) {
        if (matched.has(waitingPlayers[i].userId)) continue;

        const player1 = waitingPlayers[i];
        const waitTime = Date.now() - player1.joinedAt.getTime();
        const player1Rating = player1.user.gameStats[0]?.currentRating || 1200;

        // Determine rating range based on wait time (Zimbabwe strategy)
        let ratingRange: number;
        if (waitTime < 20000) {
          ratingRange = 75; // Initial: tight matching
        } else if (waitTime < 45000) {
          ratingRange = 150; // Medium: reasonable range
        } else if (waitTime < 90000) {
          ratingRange = 300; // Wide: accept larger differences
        } else {
          // After 90 seconds, should trigger AI match (handled by findMatch)
          continue;
        }

        // Find best opponent within rating range
        let bestOpponent = null;
        let bestRatingDiff = Infinity;

        for (let j = i + 1; j < waitingPlayers.length; j++) {
          if (matched.has(waitingPlayers[j].userId)) continue;

          const player2 = waitingPlayers[j];
          const player2Rating =
            player2.user.gameStats[0]?.currentRating || 1200;
          const ratingDiff = Math.abs(player1Rating - player2Rating);

          if (ratingDiff <= ratingRange && ratingDiff < bestRatingDiff) {
            bestOpponent = player2;
            bestRatingDiff = ratingDiff;
          }
        }

        // Create match if suitable opponent found
        if (bestOpponent) {
          try {
            await this.createMatch(player1, bestOpponent, gameType);
            matched.add(player1.userId);
            matched.add(bestOpponent.userId);

            logger.info("Background job created match", {
              gameType,
              player1: player1.user.username,
              player2: bestOpponent.user.username,
              ratingDiff: bestRatingDiff,
              waitTime: Math.round(waitTime / 1000),
            });
          } catch (error) {
            logger.error("Failed to create match in background job", {
              error,
              gameType,
              player1Id: player1.userId,
              player2Id: bestOpponent.userId,
            });
          }
        }
      }
    } catch (error) {
      logger.error("Error processing game type queue", { error, gameType });
    }
  }

  /**
   * Create match between two players
   */
  private async createMatch(
    player1: any,
    player2: any,
    gameType: string
  ): Promise<void> {
    // Get game ID
    const game = await prisma.game.findUnique({
      where: { name: gameType },
      select: { id: true },
    });

    if (!game) {
      throw new Error(`Game ${gameType} not found`);
    }

    // Create match record
    const match = await prisma.match.create({
      data: {
        player1Id: player1.userId,
        player2Id: player2.userId,
        gameId: game.id,
        status: "ACTIVE",
      },
    });

    // Remove both players from queue
    await prisma.matchmakingQueue.deleteMany({
      where: {
        userId: { in: [player1.userId, player2.userId] },
        gameType,
      },
    });

    // Emit WebSocket events to both players
    await this.notifyPlayersOfMatch(player1.userId, player2.userId, match.id);

    // Track match analytics
    const player1Rating = player1.user.gameStats[0]?.currentRating || 1200;
    const player2Rating = player2.user.gameStats[0]?.currentRating || 1200;
    const waitTime = Date.now() - player1.joinedAt.getTime();

    await this.trackMatchMetrics(
      gameType,
      player1Rating,
      player2Rating,
      waitTime,
      false // not AI match
    );
  }

  /**
   * Notify players via WebSocket that match was found
   */
  private async notifyPlayersOfMatch(
    player1Id: string,
    player2Id: string,
    matchId: string
  ): Promise<void> {
    try {
      if (!this.io) {
        logger.warn("Socket.io instance not available for match notifications");
        return;
      }

      // Get player information for notifications
      const [player1Info, player2Info] = await Promise.all([
        prisma.user.findUnique({
          where: { id: player1Id },
          select: { id: true, username: true, avatar: true },
        }),
        prisma.user.findUnique({
          where: { id: player2Id },
          select: { id: true, username: true, avatar: true },
        }),
      ]);

      // Notify player 1 (gets white pieces)
      this.io.to(`user:${player1Id}`).emit("match-found", {
        matchId,
        color: "white",
        opponent: player2Info,
        timestamp: new Date().toISOString(),
      });

      // Notify player 2 (gets black pieces)
      this.io.to(`user:${player2Id}`).emit("match-found", {
        matchId,
        color: "black",
        opponent: player1Info,
        timestamp: new Date().toISOString(),
      });

      logger.info("Match notifications sent via WebSocket", {
        player1Id,
        player2Id,
        matchId,
      });
    } catch (error) {
      logger.error("Failed to send match notifications", { error });
    }
  }

  /**
   * Track match metrics for analytics
   */
  private async trackMatchMetrics(
    gameType: string,
    player1Rating: number,
    player2Rating: number,
    waitTime: number,
    isAiMatch: boolean
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

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
          averageWaitTime: Math.round(waitTime / 1000),
          averageRatingDifference: isAiMatch
            ? undefined
            : Math.abs(player1Rating - player2Rating),
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
            : Math.abs(player1Rating - player2Rating),
          peakConcurrentUsers: 1,
        },
      });
    } catch (error) {
      logger.error("Failed to track match metrics", { error });
    }
  }

  /**
   * Broadcast queue position updates to all waiting players
   */
  private async broadcastQueueUpdates(gameType: string): Promise<void> {
    if (!this.io) return;

    try {
      // Get all waiting players for this game type
      const waitingPlayers = await prisma.matchmakingQueue.findMany({
        where: { gameType, status: "waiting" },
        orderBy: { joinedAt: "asc" },
        include: {
          user: { select: { id: true } },
        },
      });

      if (waitingPlayers.length === 0) return;

      // Calculate queue position for each player and broadcast updates
      for (let i = 0; i < waitingPlayers.length; i++) {
        const player = waitingPlayers[i];
        const position = i + 1;
        const waitTime = Date.now() - player.joinedAt.getTime();

        // Get historical average wait time
        const averageWaitTime = await this.getHistoricalWaitTime(gameType);

        // Estimate remaining wait time based on position and historical data
        const estimatedWaitTime = Math.max(
          0,
          (position - 1) * 15 + averageWaitTime
        );

        // Broadcast queue status to specific user
        this.io.to(`user:${player.userId}`).emit("queue-position-update", {
          gameType,
          position,
          totalInQueue: waitingPlayers.length,
          estimatedWaitTime,
          waitTimeSeconds: Math.round(waitTime / 1000),
          averageWaitTime,
          timestamp: new Date().toISOString(),
        });
      }

      logger.debug("Queue position updates broadcasted", {
        gameType,
        playersNotified: waitingPlayers.length,
      });
    } catch (error) {
      logger.error("Failed to broadcast queue updates", { error, gameType });
    }
  }

  /**
   * Get historical average wait time for estimates
   */
  private async getHistoricalWaitTime(gameType: string): Promise<number> {
    try {
      const recent = await prisma.matchmakingMetrics.findFirst({
        where: { gameType },
        orderBy: { date: "desc" },
        select: { averageWaitTime: true },
      });

      return recent?.averageWaitTime || 30; // Default 30 seconds
    } catch (error) {
      logger.error("Failed to get historical wait time", { error });
      return 30;
    }
  }

  /**
   * Get current queue statistics (for monitoring)
   */
  async getQueueStats(): Promise<any> {
    try {
      const stats = await prisma.matchmakingQueue.groupBy({
        by: ["gameType"],
        where: { status: "waiting" },
        _count: { _all: true },
      });

      return stats.reduce((acc, stat) => {
        acc[stat.gameType] = stat._count._all;
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      logger.error("Failed to get queue stats", { error });
      return {};
    }
  }
}

export default new MatchmakingBackgroundJob();
