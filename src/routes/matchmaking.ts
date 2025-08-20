import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import MatchmakingQueue from "../services/MatchmakingQueue"; // Keep for backward compatibility
import SkillBasedMatchmakingService from "../services/SkillBasedMatchmakingService";
import MatchmakingBackgroundJob from "../services/MatchmakingBackgroundJob";
import { prisma } from "../config/database";
import { v4 as uuidv4 } from "uuid";
import logger from "../config/logger";

const router = Router();

// Find random match (quick match)
router.post(
  "/find-match",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { gameType = "chess" } = req.body as { gameType: string };
    const userId = req.user!.id;

    // Check for existing active match, but validate it has proper game sessions
    const existingMatch = await prisma.match.findFirst({
      where: {
        game: {
          name: { equals: gameType, mode: "insensitive" },
        },
        status: "ACTIVE",
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
      select: {
        id: true,
        player1Id: true,
        player2Id: true,
        sessions: {
          where: { isActive: true },
          select: { userId: true },
        },
      },
    });

    if (existingMatch) {
      // Validate that both players have active game sessions
      const hasValidSessions =
        existingMatch.sessions.length === 2 &&
        existingMatch.sessions.some(
          (s) => s.userId === existingMatch.player1Id
        ) &&
        existingMatch.sessions.some(
          (s) => s.userId === existingMatch.player2Id
        );

      if (hasValidSessions) {
        const colorForRequester: "white" | "black" =
          existingMatch.player1Id === userId ? "white" : "black";

        return res.json({
          success: true,
          data: { matchId: existingMatch.id, color: colorForRequester },
        });
      } else {
        // Clean up invalid match
        await prisma.match.update({
          where: { id: existingMatch.id },
          data: { status: "CANCELLED" },
        });

        // Deactivate any orphaned game sessions
        await prisma.gameSession.updateMany({
          where: { matchId: existingMatch.id, isActive: true },
          data: { isActive: false },
        });
      }
    }

    // Use new skill-based matching service
    const matchResult = await SkillBasedMatchmakingService.findMatch(
      userId,
      gameType
    );

    if (matchResult.matchId) {
      // Match found (either human or AI)
      const message = matchResult.isAiMatch
        ? "No opponents available. Starting AI match."
        : "Match found! Game starting...";

      return res.json({
        success: true,
        data: {
          matchId: matchResult.matchId,
          color: matchResult.color,
        },
        message,
      });
    }

    if (matchResult.queueTicket) {
      // User added to queue, return queue status
      return res.status(202).json({
        success: true,
        message: "Queued for matchmaking",
        data: {
          ticketId: matchResult.queueTicket.id,
          position: matchResult.queueTicket.position,
          estimatedWaitTime: matchResult.queueTicket.estimatedWaitTime,
          totalInQueue: matchResult.queueTicket.totalInQueue,
        },
      });
    }

    // Fallback: create AI match if something went wrong
    const userRating = await getUserRating(userId, gameType);
    const matchId = await createMatchRecord(gameType, userId, null, userRating);
    return res.json({
      success: true,
      data: { matchId, color: "white" },
      message: "No opponents available. Starting AI match.",
    });
  })
);

// Create custom match (challenge)
router.post(
  "/create-match",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { gameType = "chess", opponent } = req.body as {
      gameType: string;
      opponent?: string;
    };
    const userId = req.user!.id;

    // If no opponent specified, create AI match
    if (!opponent) {
      const matchId = await createMatchRecord(gameType, userId, null);
      res.json({ success: true, data: { matchId, color: "white" } });
      return;
    }

    // Create challenge invitation instead of immediate match
    const invitation = await createChallengeInvitation(
      gameType,
      userId,
      opponent
    );
    res.json({
      success: true,
      data: {
        invitationId: invitation.id,
        status: "invitation_sent",
        message: "Challenge invitation sent to player",
      },
    });
  })
);

// Send challenge invitation
router.post(
  "/send-challenge",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { gameType = "chess", opponentId } = req.body as {
      gameType: string;
      opponentId: string;
    };
    const challengerId = req.user!.id;

    // Validate opponent exists and is online
    const opponent = await prisma.user.findUnique({
      where: { id: opponentId },
      select: { id: true, username: true, avatar: true },
    });

    if (!opponent) {
      return res.status(404).json({
        success: false,
        message: "Opponent not found",
      });
    }

    // Check if opponent is online and available (has general presence session)
    const isOnline = await prisma.gameSession.findFirst({
      where: {
        userId: opponentId,
        isActive: true,
        sessionType: "CASUAL",
        matchId: null, // Available, not in a match
      },
    });

    if (!isOnline) {
      return res.status(400).json({
        success: false,
        message: "Opponent is not online or is currently in a game",
      });
    }

    // Create challenge invitation
    const invitation = await createChallengeInvitation(
      gameType,
      challengerId,
      opponentId
    );

    // Send real-time notification via Socket.io
    const io = req.app.get("io");
    io.to(`user:${opponentId}`).emit("challenge-received", {
      invitationId: invitation.id,
      challenger: req.user,
      gameType,
      timestamp: new Date().toISOString(),
    });

    logger.info("Challenge invitation sent", {
      service: "nhandare-backend",
      challengerId,
      opponentId,
      gameType,
      invitationId: invitation.id,
    });

    res.json({
      success: true,
      data: {
        invitationId: invitation.id,
        status: "invitation_sent",
        message: "Challenge invitation sent successfully",
      },
    });
  })
);

// Accept challenge invitation
router.post(
  "/accept-challenge/:invitationId",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { invitationId } = req.params;
    const userId = req.user!.id;

    // Find and validate invitation
    const invitation = await prisma.challengeInvitation.findUnique({
      where: { id: invitationId },
      include: {
        challenger: { select: { id: true, username: true, avatar: true } },
        challenged: { select: { id: true, username: true, avatar: true } },
        game: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found",
      });
    }

    if (invitation.challengedId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to accept this invitation",
      });
    }

    if (invitation.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: `Invitation is ${invitation.status.toLowerCase()}`,
      });
    }

    // Accept the invitation and create match
    const matchId = await acceptChallengeInvitation(invitationId, userId);

    // Send real-time notification to challenger
    const io = req.app.get("io");
    io.to(`user:${invitation.challengerId}`).emit("challenge-accepted", {
      invitationId,
      matchId,
      acceptedBy: req.user,
      gameType: invitation.game.name,
      timestamp: new Date().toISOString(),
    });

    logger.info("Challenge accepted", {
      service: "nhandare-backend",
      challengerId: invitation.challengerId,
      challengedId: userId,
      matchId,
      invitationId,
    });

    res.json({
      success: true,
      data: {
        matchId,
        color: "black", // Challenged player is black
        status: "match_created",
        message: "Challenge accepted, match created",
      },
    });
  })
);

// Decline challenge invitation
router.post(
  "/decline-challenge/:invitationId",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { invitationId } = req.params;
    const userId = req.user!.id;

    // Find and validate invitation
    const invitation = await prisma.challengeInvitation.findUnique({
      where: { id: invitationId },
      include: {
        challenger: { select: { id: true, username: true, avatar: true } },
      },
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found",
      });
    }

    if (invitation.challengedId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to decline this invitation",
      });
    }

    if (invitation.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: `Invitation is ${invitation.status.toLowerCase()}`,
      });
    }

    // Decline the invitation
    await prisma.challengeInvitation.update({
      where: { id: invitationId },
      data: { status: "DECLINED", respondedAt: new Date() },
    });

    // Send real-time notification to challenger
    const io = req.app.get("io");
    io.to(`user:${invitation.challengerId}`).emit("challenge-declined", {
      invitationId,
      declinedBy: req.user,
      timestamp: new Date().toISOString(),
    });

    logger.info("Challenge declined", {
      service: "nhandare-backend",
      challengerId: invitation.challengerId,
      challengedId: userId,
      invitationId,
    });

    res.json({
      success: true,
      data: {
        status: "invitation_declined",
        message: "Challenge declined",
      },
    });
  })
);

// Get pending invitations for current user
router.get(
  "/pending-invitations",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const invitations = await prisma.challengeInvitation.findMany({
      where: {
        challengedId: userId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      include: {
        challenger: { select: { id: true, username: true, avatar: true } },
        game: { select: { id: true, name: true, emoji: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      data: { invitations },
    });
  })
);

// Cancel matchmaking ticket
router.delete(
  "/cancel/:ticketId",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { ticketId } = req.params;
    const { gameType } = req.query as { gameType?: string };
    const userId = req.user!.id;

    // Use new skill-based service to leave queue
    await SkillBasedMatchmakingService.leaveQueue(userId, gameType);

    // Legacy support: also remove from old queue
    MatchmakingQueue.removeByTicket(ticketId);

    logger.info("Matchmaking cancelled", {
      service: "skill-based-matchmaking",
      userId,
      gameType,
      ticketId,
    });

    res.json({ success: true, message: "Matchmaking cancelled" });
  })
);

// Get queue status
router.get(
  "/queue-status/:gameType",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { gameType } = req.params;
    const userId = req.user!.id;

    const queueStatus = await SkillBasedMatchmakingService.getQueueStatus(
      userId,
      gameType
    );

    res.json({
      success: true,
      data: queueStatus,
    });
  })
);

// Get matchmaking analytics (Zimbabwe focused)
router.get(
  "/analytics",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { gameType, days = 7 } = req.query as {
      gameType?: string;
      days?: string;
    };

    try {
      // Calculate date range
      const daysCount = Math.min(parseInt(days as string) || 7, 30); // Max 30 days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysCount);
      startDate.setHours(0, 0, 0, 0);

      // Base query conditions
      const whereClause: any = {
        date: { gte: startDate },
      };
      if (gameType) {
        whereClause.gameType = gameType;
      }

      // Get recent metrics
      const metrics = await prisma.matchmakingMetrics.findMany({
        where: whereClause,
        orderBy: { date: "desc" },
      });

      // Calculate aggregated stats
      const stats = metrics.reduce(
        (acc, metric) => {
          acc.totalMatches += metric.totalMatches;
          acc.humanMatches += metric.humanMatches;
          acc.aiMatches += metric.aiMatches;
          acc.totalWaitTime += metric.averageWaitTime * metric.totalMatches;
          acc.peakUsers = Math.max(acc.peakUsers, metric.peakConcurrentUsers);

          if (metric.averageRatingDifference) {
            acc.ratingDiffSum +=
              metric.averageRatingDifference * metric.humanMatches;
            acc.ratingDiffCount += metric.humanMatches;
          }

          return acc;
        },
        {
          totalMatches: 0,
          humanMatches: 0,
          aiMatches: 0,
          totalWaitTime: 0,
          peakUsers: 0,
          ratingDiffSum: 0,
          ratingDiffCount: 0,
        }
      );

      // Calculate percentages and averages
      const analytics = {
        period: {
          days: daysCount,
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
        },
        matches: {
          total: stats.totalMatches,
          human: stats.humanMatches,
          ai: stats.aiMatches,
          humanPercentage:
            stats.totalMatches > 0
              ? Math.round((stats.humanMatches / stats.totalMatches) * 100)
              : 0,
          aiPercentage:
            stats.totalMatches > 0
              ? Math.round((stats.aiMatches / stats.totalMatches) * 100)
              : 0,
        },
        performance: {
          averageWaitTime:
            stats.totalMatches > 0
              ? Math.round(stats.totalWaitTime / stats.totalMatches)
              : 0,
          averageRatingDifference:
            stats.ratingDiffCount > 0
              ? Math.round(stats.ratingDiffSum / stats.ratingDiffCount)
              : null,
          peakConcurrentUsers: stats.peakUsers,
        },
        daily: metrics.map((m) => ({
          date: m.date.toISOString().split("T")[0],
          gameType: m.gameType,
          totalMatches: m.totalMatches,
          humanMatches: m.humanMatches,
          aiMatches: m.aiMatches,
          averageWaitTime: m.averageWaitTime,
          averageRatingDifference: m.averageRatingDifference,
        })),
      };

      // Get current queue statistics
      const currentQueue = await MatchmakingBackgroundJob.getQueueStats();

      res.json({
        success: true,
        data: {
          analytics,
          currentQueue,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch matchmaking analytics", { error });
      res.status(500).json({
        success: false,
        message: "Failed to fetch analytics data",
      });
    }
  })
);

/**
 * @route GET /api/games/online-players
 * @desc Get online players and game activity stats
 * @access Private
 * @query list - Include list of available players (boolean)
 * @returns {object} - {
 *   online: number,        // Users online and available to play
 *   activeSessions: number, // Users currently in games
 *   byGame: object,        // Breakdown of active sessions by game type
 *   players?: array        // Available players (if list=true)
 * }
 */
router.get(
  "/online-players",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const includeList = req.query.list === "true";

    // Get general presence (users online but not necessarily in games)
    const [generalPresenceSessions, activeGameSessions, totalUsers] =
      await Promise.all([
        // Users with general presence sessions (CASUAL type, no specific match)
        // Exclude AI players from online count
        prisma.gameSession.count({
          where: {
            isActive: true,
            sessionType: "CASUAL",
            matchId: null,
            user: {
              username: { not: "ai_player" },
            },
          },
        }),
        // Users currently in active games (RANKED/TOURNAMENT type with matches)
        prisma.gameSession.count({
          where: {
            isActive: true,
            sessionType: { in: ["RANKED", "TOURNAMENT"] },
            matchId: { not: null },
          },
        }),
        prisma.user.count({ where: { isActive: true } }),
      ]);

    // Get breakdown by game type for active sessions
    const byGameAgg = await prisma.gameSession.groupBy({
      by: ["gameId"],
      where: {
        isActive: true,
        sessionType: { in: ["RANKED", "TOURNAMENT"] }, // Only count active games
        matchId: { not: null },
      },
      _count: { _all: true },
    });

    const byGame: Record<string, number> = {};
    for (const row of byGameAgg) {
      const game = await prisma.game.findUnique({
        where: { id: row.gameId },
        select: { name: true },
      });
      if (game) byGame[game.name] = row._count._all;
    }

    const responseData: any = {
      online: generalPresenceSessions, // Users online and available
      activeSessions: activeGameSessions, // Users currently playing games
      byGame,
    };

    if (includeList) {
      // Get list of online users (those with general presence)
      // Exclude AI players from the list
      const sessions = await prisma.gameSession.findMany({
        where: {
          isActive: true,
          sessionType: "CASUAL",
          matchId: null,
          user: {
            username: { not: "ai_player" },
          },
        },
        include: {
          user: {
            select: { id: true, username: true, avatar: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      // Filter out current user and ensure unique users (in case of duplicate sessions)
      const uniqueUsers = new Map();
      for (const session of sessions) {
        if (
          session.user.id !== req.user!.id &&
          !uniqueUsers.has(session.user.id)
        ) {
          uniqueUsers.set(session.user.id, {
            id: session.user.id,
            username: session.user.username,
            avatar: session.user.avatar,
            isOnline: true,
          });
        }
      }

      responseData.players = Array.from(uniqueUsers.values());

      logger.info("Online players request", {
        userId: req.user!.id,
        totalSessions: sessions.length,
        uniquePlayers: responseData.players.length,
        playerIds: responseData.players.map((p) => p.id),
      });
    }

    res.json({ success: true, data: responseData });
  })
);

// Active games endpoint
router.get(
  "/active",
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const activeMatches = await prisma.match.count({
      where: { status: "ACTIVE" },
    });
    res.json({ success: true, data: { sessions: activeMatches } });
  })
);

// Helper function to create challenge invitation
async function createChallengeInvitation(
  gameType: string,
  challengerId: string,
  challengedId: string
) {
  // Get game ID
  const game = await prisma.game.findFirst({
    where: { name: { equals: gameType, mode: "insensitive" } },
    select: { id: true },
  });

  if (!game) {
    throw new Error("Game type not found");
  }

  // Create invitation with 5-minute expiry
  const invitation = await prisma.challengeInvitation.create({
    data: {
      challengerId,
      challengedId,
      gameId: game.id,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
  });

  return invitation;
}

// Helper function to accept challenge invitation
async function acceptChallengeInvitation(
  invitationId: string,
  userId: string
): Promise<string> {
  // Get invitation details
  const invitation = await prisma.challengeInvitation.findUnique({
    where: { id: invitationId },
    include: { game: true },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  // Create match
  const match = await prisma.match.create({
    data: {
      player1Id: invitation.challengerId, // Challenger is white
      player2Id: invitation.challengedId, // Challenged is black
      gameId: invitation.gameId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  // Update invitation status
  await prisma.challengeInvitation.update({
    where: { id: invitationId },
    data: {
      status: "ACCEPTED",
      respondedAt: new Date(),
      matchId: match.id,
    },
  });

  // Transition both players from general presence to in-game sessions
  await Promise.all([
    // Deactivate general presence sessions for both players
    prisma.gameSession.updateMany({
      where: {
        userId: invitation.challengerId,
        isActive: true,
        sessionType: "CASUAL",
        matchId: null,
      },
      data: { isActive: false },
    }),
    prisma.gameSession.updateMany({
      where: {
        userId: invitation.challengedId,
        isActive: true,
        sessionType: "CASUAL",
        matchId: null,
      },
      data: { isActive: false },
    }),
    // Create new in-game sessions
    prisma.gameSession.create({
      data: {
        userId: invitation.challengerId,
        gameId: invitation.gameId,
        sessionType: "RANKED",
        matchId: match.id,
        isActive: true,
      },
    }),
    prisma.gameSession.create({
      data: {
        userId: invitation.challengedId,
        gameId: invitation.gameId,
        sessionType: "RANKED",
        matchId: match.id,
        isActive: true,
      },
    }),
  ]);

  return match.id;
}

// Helper function to create match record with smart AI difficulty
async function createMatchRecord(
  gameType: string,
  player1Id: string,
  player2Id: string | null,
  userRating?: number
): Promise<string> {
  const game = await prisma.game.findUnique({
    where: { name: gameType },
    select: { id: true },
  });

  if (!game) {
    throw new Error(`Game ${gameType} not found`);
  }

  // Determine AI difficulty based on player rating (smart difficulty)
  let gameData = {};
  if (!player2Id && userRating) {
    let aiDifficulty: string;
    if (userRating < 1300) {
      aiDifficulty = "easy";
    } else if (userRating < 1600) {
      aiDifficulty = "medium";
    } else {
      aiDifficulty = "hard";
    }

    gameData = {
      aiDifficulty,
      isAiMatch: true,
      playerRating: userRating,
    };

    logger.info("AI match configured with smart difficulty", {
      service: "nhandare-backend",
      gameType,
      userRating,
      aiDifficulty,
    });
  }

  const match = await prisma.match.create({
    data: {
      player1Id,
      player2Id: player2Id || "ai_player", // AI player
      gameId: game.id,
      status: "ACTIVE",
      gameData: gameData as any,
    },
  });

  logger.info("Match created", {
    service: "nhandare-backend",
    matchId: match.id,
    player1Id,
    player2Id: player2Id || "ai_player",
    gameType,
    isAiMatch: !player2Id,
  });

  return match.id;
}

// Helper function to get user's rating for a game
async function getUserRating(
  userId: string,
  gameType: string
): Promise<number> {
  try {
    const game = await prisma.game.findUnique({
      where: { name: gameType },
      select: { id: true },
    });

    if (!game) {
      return 1200; // Default rating
    }

    const stats = await prisma.gameStatistic.findUnique({
      where: {
        userId_gameId: {
          userId,
          gameId: game.id,
        },
      },
      select: { currentRating: true },
    });

    return stats?.currentRating || 1200;
  } catch (error) {
    logger.error("Failed to get user rating", { error, userId, gameType });
    return 1200;
  }
}

export default router;
