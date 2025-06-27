import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth";
import {
  validateSchema,
  validateQuery,
  validateParams,
} from "../middleware/validation";
import { asyncHandler } from "../middleware/errorHandler";
import Joi from "joi";
import logger from "../config/logger";

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const matchSchemas = {
  create: Joi.object({
    player2Id: Joi.string().required(),
    gameId: Joi.string().required(),
    tournamentId: Joi.string().optional(),
    round: Joi.number().integer().min(1).optional(),
  }),

  update: Joi.object({
    status: Joi.string()
      .valid("PENDING", "ACTIVE", "COMPLETED", "CANCELLED")
      .optional(),
    result: Joi.string()
      .valid("PENDING", "PLAYER1_WIN", "PLAYER2_WIN", "DRAW", "FORFEIT")
      .optional(),
    winnerId: Joi.string().optional(),
    gameData: Joi.object().optional(),
    duration: Joi.number().integer().min(0).optional(),
  }),

  list: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string()
      .valid("PENDING", "ACTIVE", "COMPLETED", "CANCELLED")
      .optional(),
    gameId: Joi.string().optional(),
    tournamentId: Joi.string().optional(),
    playerId: Joi.string().optional(),
    province: Joi.string().optional(),
    city: Joi.string().optional(),
  }),
};

/**
 * @route GET /api/matches
 * @desc Get all matches with filtering and pagination
 * @access Private
 */
router.get(
  "/",
  authenticate,
  validateQuery(matchSchemas.list),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 20,
      status,
      gameId,
      tournamentId,
      playerId,
      province,
      city,
    } = req.query as any;

    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    const where: any = {};

    if (status) where.status = status;
    if (gameId) where.gameId = gameId;
    if (tournamentId) where.tournamentId = tournamentId;

    // Filter by player (either player1 or player2)
    if (playerId) {
      where.OR = [{ player1Id: playerId }, { player2Id: playerId }];
    }

    // Filter by location (if both players are from same province/city)
    if (province || city) {
      where.AND = [
        {
          player1: {
            ...(province && { province }),
            ...(city && { city }),
          },
        },
        {
          player2: {
            ...(province && { province }),
            ...(city && { city }),
          },
        },
      ];
    }

    // Get matches with related data
    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        include: {
          player1: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              province: true,
              city: true,
              points: true,
              rank: true,
            },
          },
          player2: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              province: true,
              city: true,
              points: true,
              rank: true,
            },
          },
          game: {
            select: {
              id: true,
              name: true,
              emoji: true,
            },
          },
          tournament: {
            select: {
              id: true,
              title: true,
              prizePool: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.match.count({ where }),
    ]);

    const totalPages = Math.ceil(total / Number(limit));

    res.json({
      success: true,
      data: {
        matches,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1,
        },
      },
    });
  })
);

/**
 * @route GET /api/matches/:id
 * @desc Get match details by ID
 * @access Private
 */
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            province: true,
            city: true,
            points: true,
            rank: true,
            gamesPlayed: true,
            gamesWon: true,
            winRate: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            province: true,
            city: true,
            points: true,
            rank: true,
            gamesPlayed: true,
            gamesWon: true,
            winRate: true,
          },
        },
        game: {
          select: {
            id: true,
            name: true,
            emoji: true,
            description: true,
            rules: true,
            settings: true,
          },
        },
        tournament: {
          select: {
            id: true,
            title: true,
            description: true,
            prizePool: true,
            entryFee: true,
            status: true,
            province: true,
            city: true,
          },
        },
      },
    });

    if (!match) {
      res.status(404).json({
        success: false,
        message: "Match not found",
      });
      return;
    }

    res.json({
      success: true,
      data: { match },
    });
  })
);

/**
 * @route POST /api/matches
 * @desc Create a new match
 * @access Private
 */
router.post(
  "/",
  authenticate,
  validateSchema(matchSchemas.create),
  asyncHandler(async (req: Request, res: Response) => {
    const { player2Id, gameId, tournamentId, round } = req.body;
    const player1Id = req.user!.id;

    // Validate that both players exist
    const [player1, player2, game] = await Promise.all([
      prisma.user.findUnique({ where: { id: player1Id } }),
      prisma.user.findUnique({ where: { id: player2Id } }),
      prisma.game.findUnique({ where: { id: gameId } }),
    ]);

    if (!player1 || !player2) {
      res.status(400).json({
        success: false,
        message: "One or both players not found",
      });
      return;
    }

    if (!game) {
      res.status(400).json({
        success: false,
        message: "Game not found",
      });
      return;
    }

    // Prevent self-matching
    if (player1Id === player2Id) {
      res.status(400).json({
        success: false,
        message: "Cannot create a match with yourself",
      });
      return;
    }

    // Validate tournament if provided
    if (tournamentId) {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          players: {
            where: {
              OR: [{ userId: player1Id }, { userId: player2Id }],
            },
          },
        },
      });

      if (!tournament) {
        res.status(400).json({
          success: false,
          message: "Tournament not found",
        });
        return;
      }

      if (tournament.status !== "ACTIVE") {
        res.status(400).json({
          success: false,
          message: "Tournament is not active",
        });
        return;
      }

      // Check if both players are registered for the tournament
      if (tournament.players.length !== 2) {
        res.status(400).json({
          success: false,
          message: "Both players must be registered for the tournament",
        });
        return;
      }
    }

    // Create the match
    const match = await prisma.match.create({
      data: {
        player1Id,
        player2Id,
        gameId,
        tournamentId,
        round,
        status: "PENDING",
        result: "PENDING",
      },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            province: true,
            city: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            province: true,
            city: true,
          },
        },
        game: {
          select: {
            id: true,
            name: true,
            emoji: true,
          },
        },
        tournament: tournamentId
          ? {
              select: {
                id: true,
                title: true,
                prizePool: true,
              },
            }
          : undefined,
      },
    });

    logger.info("Match created", {
      matchId: match.id,
      player1Id,
      player2Id,
      gameId,
    });

    res.status(201).json({
      success: true,
      message: "Match created successfully",
      data: { match },
    });
  })
);

/**
 * @route PUT /api/matches/:id
 * @desc Update match status and result
 * @access Private (only match participants or tournament admin)
 */
router.put(
  "/:id",
  authenticate,
  validateSchema(matchSchemas.update),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, result, winnerId, gameData, duration } = req.body;
    const userId = req.user!.id;

    // Get the match with player info
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        tournament: {
          include: {
            players: true,
          },
        },
      },
    });

    if (!match) {
      res.status(404).json({
        success: false,
        message: "Match not found",
      });
      return;
    }

    // Check if user is authorized to update this match
    const isPlayer = match.player1Id === userId || match.player2Id === userId;
    const isTournamentAdmin = match.tournament?.players.some(
      (p) => p.userId === userId
    );

    if (!isPlayer && !isTournamentAdmin) {
      res.status(403).json({
        success: false,
        message: "Not authorized to update this match",
      });
      return;
    }

    // Validate winner if provided
    if (winnerId && ![match.player1Id, match.player2Id].includes(winnerId)) {
      res.status(400).json({
        success: false,
        message: "Winner must be one of the match participants",
      });
      return;
    }

    // Prepare update data
    const updateData: any = {};
    if (status) updateData.status = status;
    if (result) updateData.result = result;
    if (winnerId) updateData.winnerId = winnerId;
    if (gameData) updateData.gameData = gameData;
    if (duration) updateData.duration = duration;

    // Set timestamps based on status
    if (status === "ACTIVE" && match.status === "PENDING") {
      updateData.startedAt = new Date();
    } else if (status === "COMPLETED" && match.status !== "COMPLETED") {
      updateData.finishedAt = new Date();
    }

    // Update the match
    const updatedMatch = await prisma.match.update({
      where: { id },
      data: updateData,
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            province: true,
            city: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            province: true,
            city: true,
          },
        },
        game: {
          select: {
            id: true,
            name: true,
            emoji: true,
          },
        },
        tournament: {
          select: {
            id: true,
            title: true,
            prizePool: true,
          },
        },
      },
    });

    // If match is completed, update player statistics
    if (status === "COMPLETED" && result && result !== "PENDING") {
      await updatePlayerStatistics(match, result, winnerId);
    }

    logger.info("Match updated", { matchId: id, status, result, userId });

    res.json({
      success: true,
      message: "Match updated successfully",
      data: { match: updatedMatch },
    });
  })
);

/**
 * @route DELETE /api/matches/:id
 * @desc Cancel a match (only if pending)
 * @access Private (only match participants)
 */
router.delete(
  "/:id",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const match = await prisma.match.findUnique({
      where: { id },
    });

    if (!match) {
      res.status(404).json({
        success: false,
        message: "Match not found",
      });
      return;
    }

    // Check if user is a participant
    if (match.player1Id !== userId && match.player2Id !== userId) {
      res.status(403).json({
        success: false,
        message: "Not authorized to cancel this match",
      });
      return;
    }

    // Only allow cancellation of pending matches
    if (match.status !== "PENDING") {
      res.status(400).json({
        success: false,
        message: "Only pending matches can be cancelled",
      });
      return;
    }

    // Cancel the match
    await prisma.match.update({
      where: { id },
      data: {
        status: "CANCELLED",
        result: "FORFEIT",
      },
    });

    logger.info("Match cancelled", { matchId: id, userId });

    res.json({
      success: true,
      message: "Match cancelled successfully",
    });
  })
);

/**
 * @route GET /api/matches/user/:userId
 * @desc Get matches for a specific user
 * @access Private
 */
router.get(
  "/user/:userId",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { page = 1, limit = 20, status } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    const where: any = {
      OR: [{ player1Id: userId }, { player2Id: userId }],
    };

    if (status) where.status = status;

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        include: {
          player1: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              province: true,
              city: true,
            },
          },
          player2: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              province: true,
              city: true,
            },
          },
          game: {
            select: {
              id: true,
              name: true,
              emoji: true,
            },
          },
          tournament: {
            select: {
              id: true,
              title: true,
              prizePool: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.match.count({ where }),
    ]);

    const totalPages = Math.ceil(total / Number(limit));

    res.json({
      success: true,
      data: {
        matches,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1,
        },
      },
    });
  })
);

/**
 * @route GET /api/matches/tournament/:tournamentId
 * @desc Get all matches for a tournament
 * @access Private
 */
router.get(
  "/tournament/:tournamentId",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { tournamentId } = req.params;
    const { page = 1, limit = 50, round } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    const where: any = { tournamentId };

    if (round) where.round = Number(round);

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        include: {
          player1: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              province: true,
              city: true,
            },
          },
          player2: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              province: true,
              city: true,
            },
          },
          game: {
            select: {
              id: true,
              name: true,
              emoji: true,
            },
          },
        },
        orderBy: [{ round: "asc" }, { createdAt: "asc" }],
        skip,
        take: Number(limit),
      }),
      prisma.match.count({ where }),
    ]);

    const totalPages = Math.ceil(total / Number(limit));

    res.json({
      success: true,
      data: {
        matches,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1,
        },
      },
    });
  })
);

/**
 * Helper function to update player statistics when a match is completed
 */
async function updatePlayerStatistics(
  match: any,
  result: string,
  winnerId?: string
) {
  try {
    const updates = [];

    // Get current player statistics
    const [player1Stats, player2Stats] = await Promise.all([
      prisma.user.findUnique({
        where: { id: match.player1Id },
        select: { gamesPlayed: true, gamesWon: true },
      }),
      prisma.user.findUnique({
        where: { id: match.player2Id },
        select: { gamesPlayed: true, gamesWon: true },
      }),
    ]);

    // Calculate new win rates
    const player1NewGamesPlayed = (player1Stats?.gamesPlayed || 0) + 1;
    const player1NewGamesWon =
      (player1Stats?.gamesWon || 0) + (result === "PLAYER1_WIN" ? 1 : 0);
    const player1NewWinRate =
      player1NewGamesPlayed > 0
        ? Math.round((player1NewGamesWon / player1NewGamesPlayed) * 100 * 100) /
          100
        : 0;

    const player2NewGamesPlayed = (player2Stats?.gamesPlayed || 0) + 1;
    const player2NewGamesWon =
      (player2Stats?.gamesWon || 0) + (result === "PLAYER2_WIN" ? 1 : 0);
    const player2NewWinRate =
      player2NewGamesPlayed > 0
        ? Math.round((player2NewGamesWon / player2NewGamesPlayed) * 100 * 100) /
          100
        : 0;

    // Update player1 statistics
    updates.push(
      prisma.user.update({
        where: { id: match.player1Id },
        data: {
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: result === "PLAYER1_WIN" ? 1 : 0 },
          winRate: player1NewWinRate,
        },
      })
    );

    // Update player2 statistics
    updates.push(
      prisma.user.update({
        where: { id: match.player2Id },
        data: {
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: result === "PLAYER2_WIN" ? 1 : 0 },
          winRate: player2NewWinRate,
        },
      })
    );

    // Get current game statistics
    const [player1GameStats, player2GameStats] = await Promise.all([
      prisma.gameStatistic.findUnique({
        where: {
          userId_gameId: {
            userId: match.player1Id,
            gameId: match.gameId,
          },
        },
      }),
      prisma.gameStatistic.findUnique({
        where: {
          userId_gameId: {
            userId: match.player2Id,
            gameId: match.gameId,
          },
        },
      }),
    ]);

    // Calculate new game win rates
    const player1NewGameGamesPlayed = (player1GameStats?.gamesPlayed || 0) + 1;
    const player1NewGameGamesWon =
      (player1GameStats?.gamesWon || 0) + (result === "PLAYER1_WIN" ? 1 : 0);
    const player1NewGameWinRate =
      player1NewGameGamesPlayed > 0
        ? Math.round(
            (player1NewGameGamesWon / player1NewGameGamesPlayed) * 100 * 100
          ) / 100
        : 0;

    const player2NewGameGamesPlayed = (player2GameStats?.gamesPlayed || 0) + 1;
    const player2NewGameGamesWon =
      (player2GameStats?.gamesWon || 0) + (result === "PLAYER2_WIN" ? 1 : 0);
    const player2NewGameWinRate =
      player2NewGameGamesPlayed > 0
        ? Math.round(
            (player2NewGameGamesWon / player2NewGameGamesPlayed) * 100 * 100
          ) / 100
        : 0;

    // Update game statistics for both players
    updates.push(
      prisma.gameStatistic.upsert({
        where: {
          userId_gameId: {
            userId: match.player1Id,
            gameId: match.gameId,
          },
        },
        update: {
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: result === "PLAYER1_WIN" ? 1 : 0 },
          gamesLost: { increment: result === "PLAYER2_WIN" ? 1 : 0 },
          gamesDrawn: { increment: result === "DRAW" ? 1 : 0 },
          totalPlayTime: { increment: match.duration || 0 },
          winRate: player1NewGameWinRate,
        },
        create: {
          userId: match.player1Id,
          gameId: match.gameId,
          gamesPlayed: 1,
          gamesWon: result === "PLAYER1_WIN" ? 1 : 0,
          gamesLost: result === "PLAYER2_WIN" ? 1 : 0,
          gamesDrawn: result === "DRAW" ? 1 : 0,
          totalPlayTime: match.duration || 0,
          winRate: result === "PLAYER1_WIN" ? 100 : 0,
        },
      })
    );

    updates.push(
      prisma.gameStatistic.upsert({
        where: {
          userId_gameId: {
            userId: match.player2Id,
            gameId: match.gameId,
          },
        },
        update: {
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: result === "PLAYER2_WIN" ? 1 : 0 },
          gamesLost: { increment: result === "PLAYER1_WIN" ? 1 : 0 },
          gamesDrawn: { increment: result === "DRAW" ? 1 : 0 },
          totalPlayTime: { increment: match.duration || 0 },
          winRate: player2NewGameWinRate,
        },
        create: {
          userId: match.player2Id,
          gameId: match.gameId,
          gamesPlayed: 1,
          gamesWon: result === "PLAYER2_WIN" ? 1 : 0,
          gamesLost: result === "PLAYER1_WIN" ? 1 : 0,
          gamesDrawn: result === "DRAW" ? 1 : 0,
          totalPlayTime: match.duration || 0,
          winRate: result === "PLAYER2_WIN" ? 100 : 0,
        },
      })
    );

    await Promise.all(updates);

    logger.info("Player statistics updated", {
      matchId: match.id,
      result,
      winnerId,
    });
  } catch (error) {
    logger.error("Error updating player statistics", {
      error,
      matchId: match.id,
    });
  }
}

export default router;
