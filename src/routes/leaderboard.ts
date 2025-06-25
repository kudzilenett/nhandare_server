import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, optionalAuth } from "../middleware/auth";
import { validateQuery, paramSchemas } from "../middleware/validation";
import { asyncHandler } from "../middleware/errorHandler";
import logger from "../config/logger";
import joi from "joi";

const router = Router();

// Additional validation schemas for leaderboard
const leaderboardSchemas = {
  filters: joi.object({
    page: joi.number().integer().min(1).default(1),
    limit: joi.number().integer().min(1).max(100).default(20),
    gameType: joi.string().optional(),
    province: joi.string().optional(),
    city: joi.string().optional(),
    institution: joi.string().optional(),
    timeframe: joi
      .string()
      .valid("all", "month", "week", "today")
      .default("all"),
    sortBy: joi
      .string()
      .valid("points", "winRate", "gamesWon", "gamesPlayed", "rank")
      .default("points"),
    sortOrder: joi.string().valid("asc", "desc").default("desc"),
  }),
};

// GET /api/leaderboard - Global leaderboard with Zimbabwe filtering
router.get(
  "/",
  validateQuery(leaderboardSchemas.filters),
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 20,
      gameType,
      province,
      city,
      institution,
      timeframe = "all",
      sortBy = "points",
      sortOrder = "desc",
    } = req.query as any;

    const skip = (page - 1) * limit;
    const where: any = {
      isActive: true,
    };

    // Apply Zimbabwe location filters
    if (province) where.province = province;
    if (city) where.city = city;
    if (institution) where.institution = institution;

    // Apply timeframe filter
    let dateFilter = {};
    const now = new Date();
    if (timeframe === "today") {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      dateFilter = { gte: startOfDay };
    } else if (timeframe === "week") {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);
      dateFilter = { gte: startOfWeek };
    } else if (timeframe === "month") {
      const startOfMonth = new Date(now);
      startOfMonth.setMonth(now.getMonth() - 1);
      dateFilter = { gte: startOfMonth };
    }

    // Get users with statistics
    let orderBy: any = {};
    if (sortBy === "points") orderBy = { points: sortOrder };
    else if (sortBy === "winRate") orderBy = { winRate: sortOrder };
    else if (sortBy === "gamesWon") orderBy = { gamesWon: sortOrder };
    else if (sortBy === "gamesPlayed") orderBy = { gamesPlayed: sortOrder };
    else if (sortBy === "rank")
      orderBy = { rank: sortOrder === "desc" ? "asc" : "desc" }; // Lower rank number = better

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        where,
        orderBy,
        select: {
          id: true,
          username: true,
          avatar: true,
          province: true,
          city: true,
          institution: true,
          points: true,
          rank: true,
          gamesPlayed: true,
          gamesWon: true,
          winRate: true,
          isStudent: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Get current user's position if authenticated
    let currentUserPosition = null;
    if (req.user) {
      const userPosition = await prisma.user.count({
        where: {
          ...where,
          [sortBy]:
            sortOrder === "desc"
              ? { gt: req.user[sortBy as keyof typeof req.user] }
              : { lt: req.user[sortBy as keyof typeof req.user] },
        },
      });
      currentUserPosition = userPosition + 1;
    }

    // Calculate rankings based on current page
    const usersWithRankings = users.map((user, index) => ({
      ...user,
      position: skip + index + 1,
      stats: {
        totalPoints: user.points,
        winPercentage: Math.round(user.winRate * 100) / 100,
        totalMatches: user.gamesPlayed,
        wins: user.gamesWon,
        losses: user.gamesPlayed - user.gamesWon,
      },
    }));

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        leaderboard: usersWithRankings,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          limit,
        },
        filters: {
          province,
          city,
          institution,
          gameType,
          timeframe,
          sortBy,
        },
        currentUser: currentUserPosition
          ? {
              position: currentUserPosition,
            }
          : null,
      },
    });
  })
);

// GET /api/leaderboard/games/:gameId - Game-specific leaderboard
router.get(
  "/games/:gameId",
  validateQuery(leaderboardSchemas.filters),
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;
    const {
      page = 1,
      limit = 20,
      province,
      city,
      institution,
      sortBy = "currentRating",
      sortOrder = "desc",
    } = req.query as any;

    const skip = (page - 1) * limit;

    // Verify game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, name: true, emoji: true },
    });

    if (!game) {
      res.status(404).json({
        success: false,
        message: "Game not found",
      });
      return;
    }

    // Build filters for game statistics
    const userWhere: any = {
      isActive: true,
    };

    if (province) userWhere.province = province;
    if (city) userWhere.city = city;
    if (institution) userWhere.institution = institution;

    // Get game statistics with user information
    const [gameStats, total] = await Promise.all([
      prisma.gameStatistic.findMany({
        skip,
        take: limit,
        where: {
          gameId,
          user: userWhere,
        },
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
              province: true,
              city: true,
              institution: true,
              isStudent: true,
            },
          },
        },
      }),
      prisma.gameStatistic.count({
        where: {
          gameId,
          user: userWhere,
        },
      }),
    ]);

    // Calculate rankings and format data
    const leaderboardData = gameStats.map((stat, index) => ({
      position: skip + index + 1,
      user: stat.user,
      stats: {
        rating: stat.currentRating,
        peakRating: stat.peakRating,
        gamesPlayed: stat.gamesPlayed,
        gamesWon: stat.gamesWon,
        gamesLost: stat.gamesLost,
        gamesDrawn: stat.gamesDrawn,
        winRate: Math.round(stat.winRate * 100) / 100,
        averageScore: Math.round(stat.averageScore * 100) / 100,
        bestScore: stat.bestScore,
        totalPlayTime: stat.totalPlayTime,
      },
    }));

    // Get current user's position for this game
    let currentUserPosition = null;
    if (req.user) {
      const userGameStat = await prisma.gameStatistic.findUnique({
        where: {
          userId_gameId: {
            userId: req.user.id,
            gameId,
          },
        },
      });

      if (userGameStat) {
        const userPosition = await prisma.gameStatistic.count({
          where: {
            gameId,
            user: userWhere,
            [sortBy]:
              sortOrder === "desc"
                ? { gt: userGameStat[sortBy as keyof typeof userGameStat] }
                : { lt: userGameStat[sortBy as keyof typeof userGameStat] },
          },
        });
        currentUserPosition = {
          position: userPosition + 1,
          stats: {
            rating: userGameStat.currentRating,
            gamesPlayed: userGameStat.gamesPlayed,
            winRate: userGameStat.winRate,
          },
        };
      }
    }

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        game,
        leaderboard: leaderboardData,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          limit,
        },
        currentUser: currentUserPosition,
      },
    });
  })
);

// GET /api/leaderboard/provinces - Provincial rankings
router.get(
  "/provinces",
  validateQuery(leaderboardSchemas.filters),
  asyncHandler(async (req: Request, res: Response) => {
    const { gameType, sortBy = "averagePoints" } = req.query as any;

    // Get statistics by province
    const provinceStats = await prisma.user.groupBy({
      by: ["province"],
      where: {
        isActive: true,
        province: { not: null },
      },
      _count: {
        id: true,
      },
      _avg: {
        points: true,
        winRate: true,
        gamesPlayed: true,
      },
      _sum: {
        gamesWon: true,
        gamesPlayed: true,
      },
      _max: {
        points: true,
      },
    });

    // Get additional data for each province
    const provincesWithDetails = await Promise.all(
      provinceStats.map(async (stat) => {
        // Get top player in province
        const topPlayer = await prisma.user.findFirst({
          where: {
            province: stat.province,
            isActive: true,
          },
          orderBy: { points: "desc" },
          select: {
            id: true,
            username: true,
            points: true,
            rank: true,
          },
        });

        // Get total tournaments in province
        const tournamentCount = await prisma.tournament.count({
          where: {
            province: stat.province,
          },
        });

        return {
          province: stat.province,
          stats: {
            totalPlayers: stat._count.id,
            averagePoints: Math.round((stat._avg.points || 0) * 100) / 100,
            averageWinRate: Math.round((stat._avg.winRate || 0) * 100) / 100,
            totalGamesPlayed: stat._sum.gamesPlayed || 0,
            totalWins: stat._sum.gamesWon || 0,
            highestPoints: stat._max.points || 0,
            totalTournaments: tournamentCount,
          },
          topPlayer,
        };
      })
    );

    // Sort provinces by selected criteria
    const sortedProvinces = provincesWithDetails.sort((a, b) => {
      let valueA: number, valueB: number;

      switch (sortBy) {
        case "totalPlayers":
          valueA = a.stats.totalPlayers;
          valueB = b.stats.totalPlayers;
          break;
        case "averageWinRate":
          valueA = a.stats.averageWinRate;
          valueB = b.stats.averageWinRate;
          break;
        case "totalTournaments":
          valueA = a.stats.totalTournaments;
          valueB = b.stats.totalTournaments;
          break;
        default: // averagePoints
          valueA = a.stats.averagePoints;
          valueB = b.stats.averagePoints;
      }

      return valueB - valueA; // Descending order
    });

    res.json({
      success: true,
      data: {
        provinces: sortedProvinces.map((province, index) => ({
          ...province,
          rank: index + 1,
        })),
        totalProvinces: sortedProvinces.length,
        sortBy,
      },
    });
  })
);

// GET /api/leaderboard/institutions - Institution rankings
router.get(
  "/institutions",
  validateQuery(leaderboardSchemas.filters),
  asyncHandler(async (req: Request, res: Response) => {
    const { province, sortBy = "averagePoints" } = req.query as any;

    const where: any = {
      isActive: true,
      institution: { not: null },
    };

    if (province) where.province = province;

    // Get statistics by institution
    const institutionStats = await prisma.user.groupBy({
      by: ["institution"],
      where,
      _count: {
        id: true,
      },
      _avg: {
        points: true,
        winRate: true,
      },
      _sum: {
        gamesWon: true,
        gamesPlayed: true,
      },
      _max: {
        points: true,
      },
    });

    // Get additional data for each institution
    const institutionsWithDetails = await Promise.all(
      institutionStats.map(async (stat) => {
        // Get top player in institution
        const topPlayer = await prisma.user.findFirst({
          where: {
            institution: stat.institution,
            isActive: true,
            ...(province && { province }),
          },
          orderBy: { points: "desc" },
          select: {
            id: true,
            username: true,
            points: true,
            rank: true,
            province: true,
            city: true,
          },
        });

        // Get institution tournaments
        const tournamentCount = await prisma.tournament.count({
          where: {
            targetAudience: "university",
            ...(province && { province }),
          },
        });

        // Get institution data from database
        const institutionData = await prisma.institution.findFirst({
          where: {
            name: stat.institution,
          },
          select: {
            type: true,
            city: true,
            province: true,
          },
        });

        return {
          institution: stat.institution,
          type: institutionData?.type || "unknown",
          location: {
            city: institutionData?.city,
            province: institutionData?.province,
          },
          stats: {
            totalPlayers: stat._count.id,
            averagePoints: Math.round((stat._avg.points || 0) * 100) / 100,
            averageWinRate: Math.round((stat._avg.winRate || 0) * 100) / 100,
            totalGamesPlayed: stat._sum.gamesPlayed || 0,
            totalWins: stat._sum.gamesWon || 0,
            highestPoints: stat._max.points || 0,
            relatedTournaments: tournamentCount,
          },
          topPlayer,
        };
      })
    );

    // Sort institutions by selected criteria
    const sortedInstitutions = institutionsWithDetails.sort((a, b) => {
      let valueA: number, valueB: number;

      switch (sortBy) {
        case "totalPlayers":
          valueA = a.stats.totalPlayers;
          valueB = b.stats.totalPlayers;
          break;
        case "averageWinRate":
          valueA = a.stats.averageWinRate;
          valueB = b.stats.averageWinRate;
          break;
        default: // averagePoints
          valueA = a.stats.averagePoints;
          valueB = b.stats.averagePoints;
      }

      return valueB - valueA; // Descending order
    });

    res.json({
      success: true,
      data: {
        institutions: sortedInstitutions.map((institution, index) => ({
          ...institution,
          rank: index + 1,
        })),
        totalInstitutions: sortedInstitutions.length,
        filters: { province },
        sortBy,
      },
    });
  })
);

// GET /api/leaderboard/tournaments/:tournamentId - Tournament leaderboard
router.get(
  "/tournaments/:tournamentId",
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { tournamentId } = req.params;

    // Verify tournament exists
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        game: {
          select: {
            id: true,
            name: true,
            emoji: true,
          },
        },
      },
    });

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
      return;
    }

    // Get tournament players with their performance
    const players = await prisma.tournamentPlayer.findMany({
      where: {
        tournamentId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            province: true,
            city: true,
            institution: true,
            isStudent: true,
            rank: true,
          },
        },
      },
      orderBy: [
        { placement: "asc" },
        { prizeWon: "desc" },
        { currentRound: "desc" },
        { registeredAt: "asc" },
      ],
    });

    // Calculate additional statistics for each player
    const leaderboardData = await Promise.all(
      players.map(async (player, index) => {
        // Get matches for this player in this tournament
        const matches = await prisma.match.findMany({
          where: {
            tournamentId,
            OR: [{ player1Id: player.userId }, { player2Id: player.userId }],
          },
          select: {
            id: true,
            status: true,
            result: true,
            winnerId: true,
            duration: true,
          },
        });

        const wins = matches.filter((m) => m.winnerId === player.userId).length;
        const completed = matches.filter(
          (m) => m.status === "COMPLETED"
        ).length;
        const winRate = completed > 0 ? (wins / completed) * 100 : 0;

        return {
          position: player.placement || index + 1,
          user: player.user,
          tournamentStats: {
            currentRound: player.currentRound,
            isEliminated: player.isEliminated,
            placement: player.placement,
            prizeWon: player.prizeWon,
            registeredAt: player.registeredAt,
            joinedAt: player.joinedAt,
          },
          matchStats: {
            totalMatches: matches.length,
            wins,
            winRate: Math.round(winRate * 100) / 100,
            averageDuration:
              matches.length > 0
                ? Math.round(
                    matches.reduce((sum, m) => sum + (m.duration || 0), 0) /
                      matches.length
                  )
                : 0,
          },
        };
      })
    );

    res.json({
      success: true,
      data: {
        tournament: {
          id: tournament.id,
          title: tournament.title,
          game: tournament.game,
          status: tournament.status,
          prizePool: tournament.prizePool,
          currentPlayers: tournament.currentPlayers,
          maxPlayers: tournament.maxPlayers,
        },
        leaderboard: leaderboardData,
        totalPlayers: players.length,
      },
    });
  })
);

// GET /api/leaderboard/recent-winners - Recent tournament winners
router.get(
  "/recent-winners",
  validateQuery(leaderboardSchemas.filters),
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 10, province, gameType } = req.query as any;

    const skip = (page - 1) * limit;

    // Build tournament filter
    const tournamentWhere: any = {
      status: "COMPLETED",
    };

    if (province) tournamentWhere.province = province;
    if (gameType) {
      tournamentWhere.game = {
        name: { contains: gameType, mode: "insensitive" },
      };
    }

    // Get recent completed tournaments
    const tournaments = await prisma.tournament.findMany({
      skip,
      take: limit,
      where: tournamentWhere,
      orderBy: { endDate: "desc" },
      include: {
        game: {
          select: {
            id: true,
            name: true,
            emoji: true,
          },
        },
        players: {
          where: {
            placement: 1, // Winners only
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                province: true,
                city: true,
                institution: true,
              },
            },
          },
        },
      },
    });

    const totalCompleted = await prisma.tournament.count({
      where: tournamentWhere,
    });

    const winnersData = tournaments.map((tournament) => ({
      tournament: {
        id: tournament.id,
        title: tournament.title,
        game: tournament.game,
        prizePool: tournament.prizePool,
        endDate: tournament.endDate,
        province: tournament.province,
        city: tournament.city,
      },
      winner: tournament.players[0]?.user || null,
      prizeWon: tournament.players[0]?.prizeWon || 0,
    }));

    const totalPages = Math.ceil(totalCompleted / limit);

    res.json({
      success: true,
      data: {
        recentWinners: winnersData,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCompleted,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          limit,
        },
        filters: { province, gameType },
      },
    });
  })
);

export default router;
