import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, adminOnly, optionalAuth } from "../middleware/auth";
import {
  validateSchema,
  validateQuery,
  validateParams,
  schemas,
  paramSchemas,
} from "../middleware/validation";
import { asyncHandler, createError } from "../middleware/errorHandler";
import logger from "../config/logger";

const router = Router();

// Get all games with pagination
router.get(
  "/",
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 20,
      sortBy = "name",
      sortOrder = "asc",
    } = req.query as any;

    const skip = (page - 1) * limit;

    // Get games with counts
    const [games, total] = await Promise.all([
      prisma.game.findMany({
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        select: {
          id: true,
          name: true,
          description: true,
          emoji: true,
          minPlayers: true,
          maxPlayers: true,
          averageTimeMs: true,
          isActive: true,
          _count: {
            select: {
              tournaments: true,
              matches: true,
              sessions: true,
            },
          },
        },
      }),
      prisma.game.count(),
    ]);

    // Calculate pagination
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.json({
      success: true,
      data: {
        games: games.map((game) => ({
          ...game,
          stats: {
            totalTournaments: game._count.tournaments,
            totalMatches: game._count.matches,
            totalSessions: game._count.sessions,
          },
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      },
    });
  })
);

// Get game by ID with detailed statistics
router.get(
  "/:id",
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            tournaments: true,
            matches: true,
            sessions: true,
            statistics: true,
          },
        },
      },
    });

    if (!game) {
      res.status(404).json({
        success: false,
        message: "Game not found",
      });
      return;
    }

    // Get top players for this game
    const topPlayers = await prisma.gameStatistic.findMany({
      where: { gameId: id },
      select: {
        userId: true,
        gamesPlayed: true,
        gamesWon: true,
        winRate: true,
        currentRating: true,
        peakRating: true,
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: [{ currentRating: "desc" }, { gamesWon: "desc" }],
      take: 10,
    });

    res.json({
      success: true,
      data: {
        game: {
          ...game,
          stats: {
            totalTournaments: game._count.tournaments,
            totalMatches: game._count.matches,
            totalSessions: game._count.sessions,
            totalPlayers: game._count.statistics,
          },
        },
        topPlayers: topPlayers.map((stat) => ({
          user: stat.user,
          currentRating: stat.currentRating,
          gamesPlayed: stat.gamesPlayed,
          gamesWon: stat.gamesWon,
          winRate:
            stat.gamesPlayed > 0 ? (stat.gamesWon / stat.gamesPlayed) * 100 : 0,
          peakRating: stat.peakRating,
        })),
      },
    });
  })
);

// Get leaderboard for a specific game
router.get(
  "/:id/leaderboard",
  validateParams(paramSchemas.id),
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query as any;

    const skip = (page - 1) * limit;

    // Verify game exists
    const game = await prisma.game.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!game) {
      res.status(404).json({
        success: false,
        message: "Game not found",
      });
      return;
    }

    // Get leaderboard statistics
    const [stats, total] = await Promise.all([
      prisma.gameStatistic.findMany({
        where: { gameId: id },
        skip,
        take: limit,
        select: {
          userId: true,
          gamesPlayed: true,
          gamesWon: true,
          winRate: true,
          currentRating: true,
          peakRating: true,
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
              location: true,
            },
          },
        },
        orderBy: [{ currentRating: "desc" }, { gamesWon: "desc" }],
      }),
      prisma.gameStatistic.count({
        where: { gameId: id },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        game,
        leaderboard: stats.map((stat, index) => ({
          rank: skip + index + 1,
          user: stat.user,
          currentRating: stat.currentRating,
          gamesPlayed: stat.gamesPlayed,
          gamesWon: stat.gamesWon,
          winRate:
            stat.gamesPlayed > 0 ? (stat.gamesWon / stat.gamesPlayed) * 100 : 0,
          peakRating: stat.peakRating,
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          limit,
        },
      },
    });
  })
);

// Get recent matches for a game
router.get(
  "/:id/matches",
  validateParams(paramSchemas.id),
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query as any;

    const skip = (page - 1) * limit;

    // Verify game exists
    const game = await prisma.game.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!game) {
      res.status(404).json({
        success: false,
        message: "Game not found",
      });
      return;
    }

    // Get recent matches
    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where: { gameId: id },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          player1: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          player2: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          tournament: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      prisma.match.count({
        where: { gameId: id },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        game,
        matches: matches.map((match) => ({
          id: match.id,
          status: match.status,
          result: match.result,
          duration: match.duration,
          player1: match.player1,
          player2: match.player2,
          tournament: match.tournament,
          createdAt: match.createdAt,
          startedAt: match.startedAt,
          finishedAt: match.finishedAt,
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          limit,
        },
      },
    });
  })
);

// Get game statistics for authenticated user
router.get(
  "/:id/my-stats",
  validateParams(paramSchemas.id),
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify game exists
    const game = await prisma.game.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!game) {
      res.status(404).json({
        success: false,
        message: "Game not found",
      });
      return;
    }

    // Get user's statistics for this game
    const stats = await prisma.gameStatistic.findUnique({
      where: {
        userId_gameId: {
          userId,
          gameId: id,
        },
      },
    });

    if (!stats) {
      res.json({
        success: true,
        data: {
          game,
          stats: {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            gamesDrawn: 0,
            winRate: 0,
            currentRating: 1000, // Default rating
            peakRating: 1000,
            totalPlayTime: 0,
          },
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        game,
        stats: {
          gamesPlayed: stats.gamesPlayed,
          gamesWon: stats.gamesWon,
          gamesLost: stats.gamesLost,
          gamesDrawn: stats.gamesDrawn,
          winRate: stats.winRate,
          currentRating: stats.currentRating,
          peakRating: stats.peakRating,
          averageScore: stats.averageScore,
          bestScore: stats.bestScore,
          totalPlayTime: stats.totalPlayTime,
        },
      },
    });
  })
);

// Get recent sessions for a game (authenticated user)
router.get(
  "/:id/my-sessions",
  validateParams(paramSchemas.id),
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify game exists
    const game = await prisma.game.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!game) {
      res.status(404).json({
        success: false,
        message: "Game not found",
      });
      return;
    }

    // Get user's recent sessions
    const sessions = await prisma.gameSession.findMany({
      where: {
        userId,
        gameId: id,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.json({
      success: true,
      data: {
        game,
        sessions: sessions.map((session) => ({
          id: session.id,
          sessionType: session.sessionType,
          result: session.result,
          score: session.score,
          duration: session.duration,
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          finishedAt: session.finishedAt,
        })),
      },
    });
  })
);

// Admin: Create new game
router.post(
  "/",
  authenticate,
  adminOnly,
  asyncHandler(async (req, res) => {
    const {
      name,
      description,
      emoji,
      minPlayers = 2,
      maxPlayers = 2,
      averageTimeMs,
      rules,
      settings,
    } = req.body;

    const game = await prisma.game.create({
      data: {
        name,
        description,
        emoji,
        minPlayers,
        maxPlayers,
        averageTimeMs,
        rules,
        settings,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        emoji: true,
        minPlayers: true,
        maxPlayers: true,
        averageTimeMs: true,
        rules: true,
        settings: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Game created successfully",
      data: { game },
    });
  })
);

// Admin: Update game
router.patch(
  "/:id",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    const game = await prisma.game.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        description: true,
        emoji: true,
        minPlayers: true,
        maxPlayers: true,
        averageTimeMs: true,
        rules: true,
        settings: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      message: "Game updated successfully",
      data: { game },
    });
  })
);

// Admin: Toggle game active status
router.patch(
  "/:id/toggle-status",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const game = await prisma.game.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });

    if (!game) {
      throw createError("Game not found", 404, "GAME_NOT_FOUND");
    }

    const updatedGame = await prisma.game.update({
      where: { id },
      data: {
        isActive: !game.isActive,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      message: `Game ${
        updatedGame.isActive ? "activated" : "deactivated"
      } successfully`,
      data: { game: updatedGame },
    });
  })
);

export default router;
