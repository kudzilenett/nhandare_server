import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import {
  validateSchema,
  validateQuery,
  validateParams,
  schemas,
  paramSchemas,
} from "../middleware/validation";
import { authenticate, adminOnly, checkOwnership } from "../middleware/auth";
import { asyncHandler, createError } from "../middleware/errorHandler";
import logger from "../config/logger";

const router = Router();

// Get all users (with pagination and filtering)
router.get(
  "/",
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, search, location } = req.query as any;

    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const whereClause: any = {
      isActive: true,
    };

    if (search) {
      whereClause.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (location) {
      whereClause.location = { contains: location, mode: "insensitive" };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
          location: true,
          points: true,
          rank: true,
          gamesPlayed: true,
          gamesWon: true,
          winRate: true,
          isVerified: true,
          createdAt: true,
          lastLogin: true,
        },
        orderBy: { points: "desc" },
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        users,
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

// Get user by ID
router.get(
  "/:id",
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        location: true,
        points: true,
        rank: true,
        gamesPlayed: true,
        gamesWon: true,
        winRate: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        lastLogin: true,
        gameStats: {
          select: {
            gameId: true,
            gamesPlayed: true,
            gamesWon: true,
            winRate: true,
            currentRating: true,
            peakRating: true,
            game: {
              select: {
                id: true,
                name: true,
                emoji: true,
              },
            },
          },
        },
        achievements: {
          select: {
            id: true,
            unlockedAt: true,
            achievement: {
              select: {
                id: true,
                name: true,
                description: true,
                icon: true,
                type: true,
              },
            },
          },
          orderBy: { unlockedAt: "desc" },
          take: 10,
        },
      },
    });

    if (!user || !user.isActive) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    res.json({
      success: true,
      data: { user },
    });
  })
);

// Update user profile (own profile only or admin)
router.put(
  "/:id",
  validateParams(paramSchemas.id),
  checkOwnership("id"),
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { username, firstName, lastName, bio, location } = req.body;

    // Check if username is taken (if changing)
    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: username.toLowerCase(),
          NOT: { id },
        },
      });

      if (existingUser) {
        res.status(409).json({
          success: false,
          message: "Username is already taken",
        });
        return;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(username && { username: username.toLowerCase() }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(bio !== undefined && { bio }),
        ...(location && { location }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        bio: true,
        location: true,
        updatedAt: true,
      },
    });

    logger.info("User profile updated", {
      userId: id,
      updatedBy: req.user!.id,
      changes: { username, firstName, lastName, bio, location },
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: { user: updatedUser },
    });
  })
);

// Delete user account (soft delete)
router.delete(
  "/:id",
  validateParams(paramSchemas.id),
  checkOwnership("id"),
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    logger.info("User account deactivated", {
      userId: id,
      deactivatedBy: req.user!.id,
    });

    res.json({
      success: true,
      message: "Account deactivated successfully",
    });
  })
);

// Get user's game statistics
router.get(
  "/:id/stats",
  validateParams(paramSchemas.id),
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query as any;

    const skip = (page - 1) * limit;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const [stats, total] = await Promise.all([
      prisma.gameStatistic.findMany({
        where: { userId: id },
        skip,
        take: limit,
        select: {
          gameId: true,
          gamesPlayed: true,
          gamesWon: true,
          gamesLost: true,
          gamesDrawn: true,
          winRate: true,
          currentRating: true,
          peakRating: true,
          averageScore: true,
          bestScore: true,
          totalPlayTime: true,
          game: {
            select: {
              id: true,
              name: true,
              emoji: true,
            },
          },
        },
        orderBy: { gamesPlayed: "desc" },
      }),
      prisma.gameStatistic.count({
        where: { userId: id },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
        },
        stats,
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

// Get user's match history
router.get(
  "/:id/matches",
  validateParams(paramSchemas.id),
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query as any;

    const skip = (page - 1) * limit;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where: {
          OR: [{ player1Id: id }, { player2Id: id }],
        },
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
            },
          },
        },
      }),
      prisma.match.count({
        where: {
          OR: [{ player1Id: id }, { player2Id: id }],
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
        },
        matches: matches.map((match) => ({
          ...match,
          isPlayer1: match.player1Id === id,
          opponent: match.player1Id === id ? match.player2 : match.player1,
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

// Get leaderboard (top users by points)
router.get(
  "/leaderboard",
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 50 } = req.query as any;

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: {
          isActive: true,
          gamesPlayed: { gt: 0 }, // Only users who have played games
        },
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          avatar: true,
          location: true,
          points: true,
          rank: true,
          gamesPlayed: true,
          gamesWon: true,
          winRate: true,
        },
        orderBy: [
          { points: "desc" },
          { gamesWon: "desc" },
          { winRate: "desc" },
        ],
      }),
      prisma.user.count({
        where: {
          isActive: true,
          gamesPlayed: { gt: 0 },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        leaderboard: users.map((user, index) => ({
          rank: skip + index + 1,
          ...user,
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

// Get user's achievements
router.get(
  "/:id/achievements",
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const achievements = await prisma.userAchievement.findMany({
      where: { userId: id },
      include: {
        achievement: {
          select: {
            id: true,
            name: true,
            description: true,
            icon: true,
            type: true,
          },
        },
      },
      orderBy: { unlockedAt: "desc" },
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
        },
        achievements: achievements.map((ua) => ({
          ...ua.achievement,
          unlockedAt: ua.unlockedAt,
        })),
        total: achievements.length,
      },
    });
  })
);

export default router;
