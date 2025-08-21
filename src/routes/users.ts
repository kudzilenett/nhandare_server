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
import bcrypt from "bcrypt";

/**
 * Recalculate user statistics from game statistics
 */
async function recalculateUserStats(userId: string) {
  const gameStats = await prisma.gameStatistic.findMany({
    where: { userId },
    select: {
      gamesPlayed: true,
      gamesWon: true,
      gamesLost: true,
      gamesDrawn: true,
    },
  });

  const totalStats = gameStats.reduce(
    (acc, stat) => {
      acc.gamesPlayed += stat.gamesPlayed;
      acc.gamesWon += stat.gamesWon;
      acc.gamesLost += stat.gamesLost;
      acc.gamesDrawn += stat.gamesDrawn;
      return acc;
    },
    { gamesPlayed: 0, gamesWon: 0, gamesLost: 0, gamesDrawn: 0 }
  );

  const winRate =
    totalStats.gamesPlayed > 0
      ? (totalStats.gamesWon / totalStats.gamesPlayed) * 100
      : 0;

  // Update user statistics
  await prisma.user.update({
    where: { id: userId },
    data: {
      gamesPlayed: totalStats.gamesPlayed,
      gamesWon: totalStats.gamesWon,
      winRate,
    },
  });

  return totalStats;
}

/**
 * Calculate actual wallet balance from payment system
 */
async function calculateWalletBalance(userId: string): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: {
      userId,
      status: {
        in: ["COMPLETED", "REFUNDED", "PROCESSING", "PENDING"],
      },
    },
  });

  let balance = 0;
  payments.forEach((p) => {
    if (p.type === "PRIZE_PAYOUT" && p.status === "COMPLETED") {
      balance += p.amount;
    } else if (p.type === "WITHDRAWAL") {
      balance -= p.amount;
    } else if (p.type === "ENTRY_FEE" && p.status === "COMPLETED") {
      balance -= p.amount;
    }
  });

  // Round to 2 decimal places to avoid floating point precision issues
  return Math.round(balance * 100) / 100;
}

const router = Router();

// Get all users (with pagination and filtering)
router.get(
  "/",
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, search, location } = req.query as any;

    // Convert string parameters to numbers
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

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
        take: limitNum,
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          province: true,
          city: true,
          institution: true,
          isStudent: true,
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

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: total,
          hasNextPage: pageNum < totalPages,
          hasPreviousPage: pageNum > 1,
          limit: limitNum,
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
        phoneNumber: true,
        province: true,
        city: true,
        institution: true,
        isStudent: true,
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

    // Calculate actual statistics from game statistics
    const actualStats = user.gameStats.reduce(
      (acc, stat) => {
        acc.gamesPlayed += stat.gamesPlayed;
        acc.gamesWon += stat.gamesWon;
        return acc;
      },
      { gamesPlayed: 0, gamesWon: 0 }
    );

    const actualWinRate =
      actualStats.gamesPlayed > 0
        ? (actualStats.gamesWon / actualStats.gamesPlayed) * 100
        : 0;

    // Return user with corrected statistics
    const correctedUser = {
      ...user,
      gamesPlayed: actualStats.gamesPlayed,
      gamesWon: actualStats.gamesWon,
      winRate: actualWinRate,
    };

    res.json({
      success: true,
      data: { user: correctedUser },
    });
  })
);

// Update user profile (own profile only or admin)
router.put(
  "/:id",
  validateParams(paramSchemas.id),
  validateSchema(schemas.updateProfile),
  checkOwnership("id"),
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      username,
      firstName,
      lastName,
      phoneNumber,
      province,
      city,
      institution,
      isStudent,
      bio,
      location,
    } = req.body;

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
        ...(phoneNumber && { phoneNumber }),
        ...(province && { province }),
        ...(city && { city }),
        ...(institution && { institution }),
        ...(isStudent !== undefined && { isStudent }),
        ...(bio !== undefined && { bio }),
        ...(location && { location }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        province: true,
        city: true,
        institution: true,
        isStudent: true,
        bio: true,
        location: true,
        updatedAt: true,
      },
    });

    logger.info("User profile updated", {
      userId: id,
      updatedBy: req.user!.id,
      changes: {
        username,
        firstName,
        lastName,
        phoneNumber,
        province,
        city,
        institution,
        isStudent,
        bio,
        location,
      },
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
        },
      }),
    ]);

    // Get actual statistics for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const gameStats = await prisma.gameStatistic.findMany({
          where: { userId: user.id },
          select: {
            gamesPlayed: true,
            gamesWon: true,
          },
        });

        const actualStats = gameStats.reduce(
          (acc, stat) => {
            acc.gamesPlayed += stat.gamesPlayed;
            acc.gamesWon += stat.gamesWon;
            return acc;
          },
          { gamesPlayed: 0, gamesWon: 0 }
        );

        const actualWinRate =
          actualStats.gamesPlayed > 0
            ? (actualStats.gamesWon / actualStats.gamesPlayed) * 100
            : 0;

        return {
          ...user,
          gamesPlayed: actualStats.gamesPlayed,
          gamesWon: actualStats.gamesWon,
          winRate: actualWinRate,
        };
      })
    );

    // Filter out users with no games and sort by actual statistics
    const activeUsers = usersWithStats
      .filter((user) => user.gamesPlayed > 0)
      .sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
        return b.winRate - a.winRate;
      });

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        leaderboard: activeUsers.map((user, index) => ({
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

// ===== ADMIN-ONLY ENDPOINTS =====

// Get all users for admin (with advanced filtering and pagination)
router.get(
  "/admin/all",
  authenticate,
  adminOnly,
  validateQuery(schemas.adminUserList),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      role,
      sortBy = "lastLogin",
      sortOrder = "desc",
      hasPlayedGames,
      hasWalletBalance,
      dateRange,
    } = req.query as any;

    // Convert string parameters to numbers
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause for filtering
    const whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) {
      whereClause.isActive = status === "active";
    }

    if (role) {
      whereClause.role = role;
    }

    if (hasPlayedGames === "true") {
      whereClause.gamesPlayed = { gt: 0 };
    } else if (hasPlayedGames === "false") {
      whereClause.gamesPlayed = 0;
    }

    if (hasWalletBalance === "true") {
      whereClause.points = { gt: 0 };
    } else if (hasWalletBalance === "false") {
      whereClause.points = 0;
    }

    if (dateRange) {
      const { start, end } = JSON.parse(dateRange as string);
      whereClause.createdAt = {
        gte: new Date(start),
        lte: new Date(end),
      };
    }

    // Build order by clause
    const orderBy: any = {};
    if (sortBy === "lastActive") {
      orderBy.lastLogin = sortOrder;
    } else if (sortBy === "username") {
      orderBy.username = sortOrder;
    } else if (sortBy === "status") {
      orderBy.isActive = sortOrder;
    } else if (sortBy === "role") {
      orderBy.role = sortOrder;
    } else if (sortBy === "winRate") {
      orderBy.winRate = sortOrder;
    } else if (sortBy === "totalGamesPlayed") {
      orderBy.gamesPlayed = sortOrder;
    } else {
      orderBy.createdAt = sortOrder;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: limitNum,
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          role: true,
          isActive: true,
          isVerified: true,
          points: true,
          gamesPlayed: true,
          gamesWon: true,
          winRate: true,
          createdAt: true,
          lastLogin: true,
          updatedAt: true,
        },
        orderBy,
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    // Get actual game statistics and wallet balance for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const [gameStats, walletBalance] = await Promise.all([
          prisma.gameStatistic.findMany({
            where: { userId: user.id },
            select: {
              gamesPlayed: true,
              gamesWon: true,
              gamesLost: true,
              gamesDrawn: true,
            },
          }),
          calculateWalletBalance(user.id),
        ]);

        // Calculate actual totals from game statistics
        const actualStats = gameStats.reduce(
          (acc, stat) => {
            acc.gamesPlayed += stat.gamesPlayed;
            acc.gamesWon += stat.gamesWon;
            acc.gamesLost += stat.gamesLost;
            acc.gamesDrawn += stat.gamesDrawn;
            return acc;
          },
          { gamesPlayed: 0, gamesWon: 0, gamesLost: 0, gamesDrawn: 0 }
        );

        const actualWinRate =
          actualStats.gamesPlayed > 0
            ? (actualStats.gamesWon / actualStats.gamesPlayed) * 100
            : 0;

        return {
          ...user,
          actualGamesPlayed: actualStats.gamesPlayed,
          actualGamesWon: actualStats.gamesWon,
          actualGamesLost: actualStats.gamesLost,
          actualGamesDrawn: actualStats.gamesDrawn,
          actualWinRate,
          actualWalletBalance: walletBalance,
        };
      })
    );

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: {
        users: usersWithStats.map((user) => ({
          ...user,
          status: user.isActive ? "active" : "inactive",
          walletBalance: user.actualWalletBalance,
          totalGamesPlayed: user.actualGamesPlayed,
          totalWins: user.actualGamesWon,
          totalLosses: user.actualGamesLost,
          totalDraws: user.actualGamesDrawn,
          actualWinRate: user.actualWinRate,
          lastActive: user.lastLogin,
        })),
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: total,
          hasNextPage: pageNum < totalPages,
          hasPreviousPage: pageNum > 1,
          itemsPerPage: limitNum,
        },
        filters: {
          status: [
            {
              label: "Active",
              value: "active",
              count: await prisma.user.count({ where: { isActive: true } }),
            },
            {
              label: "Inactive",
              value: "inactive",
              count: await prisma.user.count({ where: { isActive: false } }),
            },
          ],
          role: [
            {
              label: "User",
              value: "user",
              count: await prisma.user.count({ where: { role: "user" } }),
            },
            {
              label: "Admin",
              value: "admin",
              count: await prisma.user.count({ where: { role: "admin" } }),
            },
            {
              label: "Moderator",
              value: "moderator",
              count: await prisma.user.count({ where: { role: "moderator" } }),
            },
          ],
        },
      },
    });
  })
);

// Create new user (admin only)
router.post(
  "/admin/create",
  authenticate,
  adminOnly,
  validateSchema(schemas.createUser),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      username,
      email,
      firstName,
      lastName,
      phoneNumber,
      role = "user",
      status = "active",
      password,
      sendWelcomeEmail = false,
    } = req.body;

    // Check if username or email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.toLowerCase() },
          { email: email.toLowerCase() },
        ],
      },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "Username or email already exists",
      });
      return;
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        firstName,
        lastName,
        phoneNumber,
        role,
        location: "Zimbabwe", // Default location for admin-created users
        isActive: status === "active",
        isVerified: true, // Admin-created users are verified by default
        password: await bcrypt.hash(password, 10),
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        isVerified: true,
        points: true,
        gamesPlayed: true,
        gamesWon: true,
        winRate: true,
        createdAt: true,
        lastLogin: true,
        updatedAt: true,
      },
    });

    // Send welcome email if requested
    if (sendWelcomeEmail) {
      // TODO: Implement email sending
      logger.info(`Welcome email would be sent to ${user.email}`);
    }

    res.status(201).json({
      success: true,
      data: {
        user: {
          ...user,
          status: user.isActive ? "active" : "inactive",
          walletBalance: 0, // New users start with 0 wallet balance
          totalGamesPlayed: user.gamesPlayed,
          totalWins: user.gamesWon,
          totalLosses: user.gamesPlayed - user.gamesWon,
          lastActive: user.lastLogin,
        },
      },
    });
  })
);

// Update user (admin only)
router.put(
  "/admin/:id",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  validateSchema(schemas.updateUser),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      username,
      email,
      firstName,
      lastName,
      phoneNumber,
      role,
      status,
      walletBalance,
      isEmailVerified,
      isPhoneVerified,
    } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Check if username or email is taken by another user
    if (username || email) {
      const conflictingUser = await prisma.user.findFirst({
        where: {
          OR: [
            ...(username ? [{ username: username.toLowerCase() }] : []),
            ...(email ? [{ email: email.toLowerCase() }] : []),
          ],
          NOT: { id },
        },
      });

      if (conflictingUser) {
        res.status(409).json({
          success: false,
          message: "Username or email already exists",
        });
        return;
      }
    }

    // Handle wallet balance adjustment
    if (walletBalance !== undefined) {
      const currentBalance = await calculateWalletBalance(id);
      const difference = walletBalance - currentBalance;

      if (difference !== 0) {
        // Create a payment record for the balance adjustment
        await prisma.payment.create({
          data: {
            userId: id,
            amount: Math.abs(difference),
            currency: "USD",
            type: difference > 0 ? "PRIZE_PAYOUT" : "WITHDRAWAL",
            status: "COMPLETED",
            paymentConfirmedAt: new Date(),
            metadata: {
              reason: "Admin balance adjustment",
              adjustedBy: req.user!.id,
              previousBalance: currentBalance,
              newBalance: walletBalance,
              adjustment: difference,
              processedAt: new Date().toISOString(),
            },
          },
        });
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(username && { username: username.toLowerCase() }),
        ...(email && { email: email.toLowerCase() }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phoneNumber && { phoneNumber }),
        ...(role && { role }),
        ...(status && { isActive: status === "active" }),
        ...(isEmailVerified !== undefined && { isVerified: isEmailVerified }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        isVerified: true,
        points: true,
        gamesPlayed: true,
        gamesWon: true,
        winRate: true,
        createdAt: true,
        lastLogin: true,
        updatedAt: true,
      },
    });

    // Calculate actual wallet balance for the updated user
    const actualWalletBalance = await calculateWalletBalance(id);

    res.json({
      success: true,
      data: {
        user: {
          ...updatedUser,
          status: updatedUser.isActive ? "active" : "inactive",
          walletBalance: actualWalletBalance,
          totalGamesPlayed: updatedUser.gamesPlayed,
          totalWins: updatedUser.gamesWon,
          totalLosses: updatedUser.gamesPlayed - updatedUser.gamesWon,
          lastActive: updatedUser.lastLogin,
        },
      },
    });
  })
);

// Delete user (admin only)
router.delete(
  "/admin/:id",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Soft delete by setting isActive to false
    await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  })
);

// Activate user (admin only)
router.patch(
  "/admin/:id/activate",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
      },
    });

    res.json({
      success: true,
      data: { user },
    });
  })
);

// Deactivate user (admin only)
router.patch(
  "/admin/:id/deactivate",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
      },
    });

    // Log the deactivation reason
    logger.info(
      `User ${user.username} deactivated by admin. Reason: ${
        reason || "No reason provided"
      }`
    );

    res.json({
      success: true,
      data: { user },
    });
  })
);

// Ban user (admin only)
router.patch(
  "/admin/:id/ban",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason, duration } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
      },
    });

    // Log the ban
    logger.info(
      `User ${user.username} banned by admin. Reason: ${
        reason || "No reason provided"
      }. Duration: ${duration || "permanent"}`
    );

    res.json({
      success: true,
      data: { user },
    });
  })
);

// Unban user (admin only)
router.patch(
  "/admin/:id/unban",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
      },
    });

    res.json({
      success: true,
      data: { user },
    });
  })
);

// Assign role to user (admin only)
router.patch(
  "/admin/:id/assign-role",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!["user", "admin", "moderator"].includes(role)) {
      res.status(400).json({
        success: false,
        message: "Invalid role. Must be 'user', 'admin', or 'moderator'",
      });
      return;
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        role,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });

    res.json({
      success: true,
      data: { user },
    });
  })
);

// Bulk operations (admin only)
router.post(
  "/admin/bulk-update",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { userIds, updates } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "User IDs array is required",
      });
      return;
    }

    const updatedUsers = await prisma.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        updatedCount: updatedUsers.count,
      },
    });
  })
);

// Bulk delete users (admin only)
router.post(
  "/admin/bulk-delete",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "User IDs array is required",
      });
      return;
    }

    const deletedUsers = await prisma.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        deletedCount: deletedUsers.count,
      },
    });
  })
);

// Recalculate user statistics (admin only)
router.post(
  "/admin/recalculate-stats",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.body;

    if (userId) {
      // Recalculate for specific user
      const stats = await recalculateUserStats(userId);

      res.json({
        success: true,
        message: "User statistics recalculated successfully",
        data: { stats },
      });
    } else {
      // Recalculate for all users
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      let updatedCount = 0;
      for (const user of users) {
        try {
          await recalculateUserStats(user.id);
          updatedCount++;
        } catch (error) {
          logger.error(`Failed to recalculate stats for user ${user.id}`, {
            error,
          });
        }
      }

      res.json({
        success: true,
        message: "All user statistics recalculated successfully",
        data: { updatedCount },
      });
    }
  })
);

// Get user statistics (admin only)
router.get(
  "/:id/stats",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        gameStats: {
          include: {
            game: true,
          },
        },
        tournaments: {
          include: {
            tournament: true,
          },
        },
        payments: {
          where: {
            status: "COMPLETED",
            type: "PRIZE_PAYOUT",
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Calculate comprehensive stats
    const totalGamesPlayed = user.gameStats.reduce(
      (sum, stat) => sum + stat.gamesPlayed,
      0
    );
    const totalWins = user.gameStats.reduce(
      (sum, stat) => sum + stat.gamesWon,
      0
    );
    const totalLosses = user.gameStats.reduce(
      (sum, stat) => sum + stat.gamesLost,
      0
    );
    const totalDraws = user.gameStats.reduce(
      (sum, stat) => sum + stat.gamesDrawn,
      0
    );
    const totalTimeSpent = user.gameStats.reduce(
      (sum, stat) => sum + stat.totalPlayTime,
      0
    );

    const winRate =
      totalGamesPlayed > 0 ? (totalWins / totalGamesPlayed) * 100 : 0;
    const currentEloRating = user.gameStats[0]?.currentRating || 1200;
    const highestEloRating = Math.max(
      ...user.gameStats.map((stat) => stat.peakRating),
      1200
    );

    const totalTournamentsPlayed = user.tournaments.length;
    const totalTournamentsWon = user.tournaments.filter(
      (t) => t.placement === 1
    ).length;
    const totalWinnings = user.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );

    const favoriteGameType =
      user.gameStats.length > 0
        ? user.gameStats.reduce((prev, current) =>
            prev.gamesPlayed > current.gamesPlayed ? prev : current
          ).game.name
        : "None";

    const stats = {
      totalGamesPlayed,
      totalWins,
      totalLosses,
      totalDraws,
      winRate,
      currentEloRating,
      highestEloRating,
      totalTournamentsPlayed,
      totalTournamentsWon,
      totalWinnings,
      averageGameDuration:
        totalGamesPlayed > 0 ? totalTimeSpent / totalGamesPlayed / 60 : 0, // in minutes
      favoriteGameType,
      lastActiveDate: user.lastLogin?.toISOString() || "",
      accountCreatedDate: user.createdAt.toISOString(),
      totalTimeSpent: Math.floor(totalTimeSpent / 60), // in minutes
    };

    res.json({
      success: true,
      data: stats,
    });
  })
);

// Get user activity log (admin only)
router.get(
  "/:id/activity",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get real activity data using proper Prisma ORM
    const activities = await prisma.userActivity.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    // Get total count
    const total = await prisma.userActivity.count({
      where: { userId: id },
    });

    res.json({
      success: true,
      data: {
        activities: (activities as any[]).map((activity: any) => ({
          id: activity.id,
          userId: activity.userId,
          activityType: activity.activityType,
          description: activity.description,
          ipAddress: activity.ipAddress,
          userAgent: activity.userAgent,
          metadata: activity.metadata,
          createdAt: activity.createdAt,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  })
);

// Log user activity (for future implementation)
router.post(
  "/:id/activity",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { activityType, description, metadata, ipAddress, userAgent } =
      req.body;

    // Store activity using proper Prisma ORM
    await prisma.userActivity.create({
      data: {
        userId: id,
        activityType,
        description,
        ipAddress,
        userAgent,
        metadata,
      },
    });

    res.json({
      success: true,
      message: "Activity logged successfully",
    });
  })
);

export default router;
