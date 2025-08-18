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
import { roundToCents } from "../utils/currency";

const router = Router();

// GET /api/tournaments - Get all tournaments with Zimbabwe filtering
router.get(
  "/",
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      province,
      city,
      category,
      status,
      gameType,
      minPrize,
      maxPrize,
      targetAudience,
    } = req.query as any;

    // Ensure numeric pagination values
    const pageNumber =
      typeof page === "string" ? parseInt(page, 10) || 1 : page;
    const limitNumber =
      typeof limit === "string" ? parseInt(limit, 10) || 20 : limit;

    const skip = (pageNumber - 1) * limitNumber;

    // Build filter conditions
    const where: any = {};

    if (province) where.province = province;
    if (city) where.city = city;
    if (category) where.category = category;
    if (status) where.status = status;
    if (gameType)
      where.game = { name: { contains: gameType, mode: "insensitive" } };
    if (targetAudience) where.targetAudience = targetAudience;
    if (minPrize)
      where.prizePool = { ...where.prizePool, gte: parseFloat(minPrize) };
    if (maxPrize)
      where.prizePool = { ...where.prizePool, lte: parseFloat(maxPrize) };

    // Get tournaments with counts
    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        skip,
        take: limitNumber,
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          game: {
            select: {
              id: true,
              name: true,
              emoji: true,
              minPlayers: true,
              maxPlayers: true,
            },
          },
          _count: {
            select: {
              players: true,
              matches: true,
            },
          },
        },
      }),
      prisma.tournament.count({ where }),
    ]);

    // Calculate pagination
    const totalPages = Math.ceil(total / limitNumber);
    const hasNextPage = pageNumber < totalPages;
    const hasPreviousPage = pageNumber > 1;

    res.json({
      success: true,
      data: {
        tournaments: tournaments.map((tournament) => ({
          ...tournament,
          stats: {
            totalPlayers: tournament._count.players,
            totalMatches: tournament._count.matches,
            spotsRemaining: tournament.maxPlayers - tournament.currentPlayers,
          },
        })),
        pagination: {
          currentPage: pageNumber,
          totalPages,
          totalItems: total,
          hasNextPage,
          hasPreviousPage,
          limit: limitNumber,
        },
      },
    });
  })
);

// GET /api/tournaments/:id - Get tournament by ID with detailed information
router.get(
  "/:id",
  validateParams(paramSchemas.id),
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.id;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        game: true,
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                province: true,
                city: true,
              },
            },
          },
        },
        _count: {
          select: {
            players: true,
            matches: true,
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

    // Check if user is registered
    let userRegistration = null;
    if (userId) {
      userRegistration = await prisma.tournamentPlayer.findUnique({
        where: {
          userId_tournamentId: {
            userId,
            tournamentId: id,
          },
        },
      });
    }

    res.json({
      success: true,
      data: {
        tournament: {
          ...tournament,
          stats: {
            totalPlayers: tournament._count.players,
            totalMatches: tournament._count.matches,
            spotsRemaining: tournament.maxPlayers - tournament.currentPlayers,
          },
          userRegistration,
        },
      },
    });
  })
);

// POST /api/tournaments - Create new tournament (authenticated users only)
router.post(
  "/",
  authenticate,
  validateSchema(schemas.tournament),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      title,
      description,
      gameId,
      entryFee,
      prizePool,
      maxPlayers,
      province,
      city,
      location,
      venue,
      isOnlineOnly,
      targetAudience,
      sponsorName,
      minimumAge,
      maxAge,
      category,
      difficultyLevel,
      prizeBreakdown,
      localCurrency,
      platformFeeRate,
      registrationStart,
      registrationEnd,
      startDate,
      endDate,
      bracketType,
    } = req.body;

    // Verify game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game) {
      res.status(400).json({
        success: false,
        message: "Game not found",
      });
      return;
    }

    // Validate business rules
    if (entryFee < 1 || entryFee > 100) {
      res.status(400).json({
        success: false,
        message: "Entry fee must be between $1 and $100 USD",
      });
      return;
    }

    if (prizePool < entryFee * maxPlayers * 0.7) {
      res.status(400).json({
        success: false,
        message: "Prize pool must be at least 70% of total entry fees",
      });
      return;
    }

    const tournament = await prisma.tournament.create({
      data: {
        title,
        description,
        gameId,
        entryFee: roundToCents(entryFee),
        prizePool: roundToCents(prizePool),
        maxPlayers,
        province,
        city,
        location: location || `${city}, ${province}`,
        venue,
        isOnlineOnly: isOnlineOnly ?? true,
        targetAudience,
        sponsorName,
        minimumAge,
        maxAge,
        category,
        difficultyLevel,
        prizeBreakdown,
        localCurrency: localCurrency || "USD",
        platformFeeRate: platformFeeRate || 0.2,
        registrationStart: new Date(registrationStart),
        registrationEnd: new Date(registrationEnd),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        bracketType: bracketType || "SINGLE_ELIMINATION",
      },
      include: {
        game: true,
      },
    });

    logger.info("Tournament created", {
      service: "nhandare-backend",
      tournamentId: tournament.id,
      title: tournament.title,
      createdBy: req.user!.id,
    });

    res.status(201).json({
      success: true,
      message: "Tournament created successfully",
      data: { tournament },
    });
  })
);

// POST /api/tournaments/:id/join - Join tournament with payment
router.post(
  "/:id/join",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if tournament exists and is open
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        _count: {
          select: { players: true },
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

    if (tournament.status !== "OPEN") {
      res.status(400).json({
        success: false,
        message: "Tournament registration is closed",
      });
      return;
    }

    if (tournament._count.players >= tournament.maxPlayers) {
      res.status(400).json({
        success: false,
        message: "Tournament is full",
      });
      return;
    }

    // Check if user is already registered
    const existingRegistration = await prisma.tournamentPlayer.findUnique({
      where: {
        userId_tournamentId: {
          userId,
          tournamentId: id,
        },
      },
    });

    if (existingRegistration) {
      res.status(400).json({
        success: false,
        message: "You are already registered for this tournament",
      });
      return;
    }

    // Create tournament player registration
    const tournamentPlayer = await prisma.tournamentPlayer.create({
      data: {
        userId,
        tournamentId: id,
        isActive: true,
      },
    });

    // Update tournament player count
    await prisma.tournament.update({
      where: { id },
      data: {
        currentPlayers: {
          increment: 1,
        },
      },
    });

    res.json({
      success: true,
      message: "Successfully joined tournament",
      data: { registration: tournamentPlayer },
    });
  })
);

// DELETE /api/tournaments/:id/leave - Leave tournament (with refund logic)
router.delete(
  "/:id/leave",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if user is registered
    const registration = await prisma.tournamentPlayer.findUnique({
      where: {
        userId_tournamentId: {
          userId,
          tournamentId: id,
        },
      },
      include: {
        tournament: true,
      },
    });

    if (!registration) {
      res.status(404).json({
        success: false,
        message: "You are not registered for this tournament",
      });
      return;
    }

    if (registration.tournament.status === "ACTIVE") {
      res.status(400).json({
        success: false,
        message: "Cannot leave tournament after it has started",
      });
      return;
    }

    // Remove from tournament
    await prisma.tournamentPlayer.delete({
      where: {
        userId_tournamentId: {
          userId,
          tournamentId: id,
        },
      },
    });

    // Update tournament player count
    await prisma.tournament.update({
      where: { id },
      data: {
        currentPlayers: {
          decrement: 1,
        },
      },
    });

    res.json({
      success: true,
      message: "Successfully left tournament",
    });
  })
);

// GET /api/tournaments/:id/bracket - Get tournament bracket
router.get(
  "/:id/bracket",
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
        matches: {
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

    res.json({
      success: true,
      data: {
        tournament: {
          id: tournament.id,
          title: tournament.title,
          status: tournament.status,
          bracketType: tournament.bracketType,
          bracket: tournament.bracket,
        },
        players: tournament.players,
        matches: tournament.matches,
      },
    });
  })
);

// GET /api/tournaments/by-location/:province - Get tournaments by province
router.get(
  "/by-location/:province",
  validateQuery(schemas.pagination),
  asyncHandler(async (req: Request, res: Response) => {
    const { province } = req.params;
    const { page = 1, limit = 20, city } = req.query as any;

    // Ensure numeric pagination values
    const pageNumber =
      typeof page === "string" ? parseInt(page, 10) || 1 : page;
    const limitNumber =
      typeof limit === "string" ? parseInt(limit, 10) || 20 : limit;

    const skip = (pageNumber - 1) * limitNumber;

    const where: any = { province };
    if (city) where.city = city;

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        skip,
        take: limitNumber,
        where,
        orderBy: { createdAt: "desc" },
        include: {
          game: {
            select: {
              id: true,
              name: true,
              emoji: true,
            },
          },
          _count: {
            select: { players: true },
          },
        },
      }),
      prisma.tournament.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNumber);

    res.json({
      success: true,
      data: {
        tournaments: tournaments.map((tournament) => ({
          ...tournament,
          stats: {
            totalPlayers: tournament._count.players,
            spotsRemaining: tournament.maxPlayers - tournament.currentPlayers,
          },
        })),
        pagination: {
          currentPage: pageNumber,
          totalPages,
          totalItems: total,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
          limit: limitNumber,
        },
      },
    });
  })
);

// PUT /api/tournaments/:id - Update tournament (admin only)
router.put(
  "/:id",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
      return;
    }

    // Transform numeric fields to proper types
    if (updateData.entryFee !== undefined) {
      updateData.entryFee = roundToCents(updateData.entryFee);
    }
    if (updateData.prizePool !== undefined) {
      updateData.prizePool = roundToCents(updateData.prizePool);
    }

    // Transform date fields to Date objects
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = updateData.endDate
        ? new Date(updateData.endDate)
        : null;
    }
    if (updateData.registrationStart) {
      updateData.registrationStart = new Date(updateData.registrationStart);
    }
    if (updateData.registrationEnd) {
      updateData.registrationEnd = new Date(updateData.registrationEnd);
    }

    const updatedTournament = await prisma.tournament.update({
      where: { id },
      data: updateData,
      include: {
        game: true,
      },
    });

    res.json({
      success: true,
      message: "Tournament updated successfully",
      data: { tournament: updatedTournament },
    });
  })
);

// DELETE /api/tournaments/:id - Cancel tournament (admin only)
router.delete(
  "/:id",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
      return;
    }

    if (tournament.status === "ACTIVE") {
      res.status(400).json({
        success: false,
        message: "Cannot cancel active tournament",
      });
      return;
    }

    await prisma.tournament.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    res.json({
      success: true,
      message: "Tournament cancelled successfully",
    });
  })
);

// GET /api/tournaments/:id/chat - Get chat history for a tournament
router.get(
  "/:id/chat",
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const limit = Math.min(
      100,
      parseInt((req.query.limit as string) || "50", 10) || 50
    );

    // Verify tournament exists
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) {
      res.status(404).json({ success: false, message: "Tournament not found" });
      return;
    }

    // Fetch messages (latest first)
    // @ts-ignore – generated after Prisma schema update
    const messages = await prisma.tournamentChatMessage.findMany({
      where: { tournamentId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    const formatted = messages
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        username: (m as any).user?.username || "Unknown",
        text: m.text,
        timestamp: m.createdAt.getTime(),
      }))
      .reverse(); // chronological

    res.json({ success: true, data: { messages: formatted } });
  })
);

// POST /api/tournaments/:id/complete - Manually complete tournament (admin only)
router.post(
  "/:id/complete",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const { TournamentCompletionService } = await import(
        "../services/TournamentCompletionService"
      );

      const result = await TournamentCompletionService.completeTournament(id);

      if (result.success) {
        logger.info("Tournament manually completed by admin", {
          tournamentId: id,
          adminId: req.user!.id,
          winners: result.winners,
        });

        res.json({
          success: true,
          message: result.message,
          data: {
            tournamentId: id,
            winners: result.winners,
            completedAt: new Date().toISOString(),
          },
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error("Error manually completing tournament", {
        tournamentId: id,
        adminId: req.user!.id,
        error,
      });

      res.status(500).json({
        success: false,
        message: "Failed to complete tournament",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// POST /api/tournaments/test-completion - Test tournament completion with mock data (admin only)
router.post(
  "/test-completion",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { TournamentCompletionService } = await import(
        "../services/TournamentCompletionService"
      );

      // Create a test tournament with completed matches
      const testTournament = await prisma.tournament.create({
        data: {
          title: "Test Tournament - Auto Completion",
          description: "Test tournament for automatic completion",
          gameId: "cmdagyyhf000xj02s4mbksft5", // Chess game
          entryFee: 0,
          prizePool: 100,
          maxPlayers: 4,
          currentPlayers: 4,
          status: "ACTIVE",
          province: "Harare",
          city: "Harare",
          location: "Test Location",
          isOnlineOnly: true,
          targetAudience: "public",
          category: "PUBLIC",
          difficultyLevel: "beginner",
          prizeBreakdown: {
            first: 60,
            second: 25,
            third: 15,
          },
          registrationStart: new Date(),
          registrationEnd: new Date(),
          startDate: new Date(),
          endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
          bracketType: "SINGLE_ELIMINATION",
        },
      });

      // Create 4 test players
      const testPlayers = await Promise.all([
        prisma.tournamentPlayer.create({
          data: {
            userId: "cmdagz2ab0011j02s6afi6q11", // admin
            tournamentId: testTournament.id,
            joinedAt: new Date(),
            isActive: true,
            seedNumber: 1,
          },
        }),
        prisma.tournamentPlayer.create({
          data: {
            userId: "cmdagz2k0002aj02sfg0ba2h3", // another user
            tournamentId: testTournament.id,
            joinedAt: new Date(),
            isActive: true,
            seedNumber: 2,
          },
        }),
        prisma.tournamentPlayer.create({
          data: {
            userId: "cmdagz2jc0029j02s8652qsd0", // third user
            tournamentId: testTournament.id,
            joinedAt: new Date(),
            isActive: true,
            seedNumber: 3,
          },
        }),
        prisma.tournamentPlayer.create({
          data: {
            userId: "cmdagz2k6002bj02sthycopg7", // fourth user
            tournamentId: testTournament.id,
            joinedAt: new Date(),
            isActive: true,
            seedNumber: 4,
          },
        }),
      ]);

      // Create completed matches for a simple bracket
      const matches = await Promise.all([
        // Semifinal 1: Player 1 vs Player 2
        prisma.match.create({
          data: {
            player1Id: testPlayers[0].userId,
            player2Id: testPlayers[1].userId,
            gameId: "cmdagyyhf000xj02s4mbksft5",
            tournamentId: testTournament.id,
            round: 1,
            status: "COMPLETED",
            result: "PLAYER1_WIN",
            winnerId: testPlayers[0].userId,
            duration: 1800,
            createdAt: new Date(),
            startedAt: new Date(),
            finishedAt: new Date(),
          },
        }),
        // Semifinal 2: Player 3 vs Player 4
        prisma.match.create({
          data: {
            player1Id: testPlayers[2].userId,
            player2Id: testPlayers[3].userId,
            gameId: "cmdagyyhf000xj02s4mbksft5",
            tournamentId: testTournament.id,
            round: 1,
            status: "COMPLETED",
            result: "PLAYER2_WIN",
            winnerId: testPlayers[3].userId,
            duration: 2100,
            createdAt: new Date(),
            startedAt: new Date(),
            finishedAt: new Date(),
          },
        }),
        // Final: Winner of semifinal 1 vs Winner of semifinal 2
        prisma.match.create({
          data: {
            player1Id: testPlayers[0].userId,
            player2Id: testPlayers[3].userId,
            gameId: "cmdagyyhf000xj02s4mbksft5",
            tournamentId: testTournament.id,
            round: 2,
            status: "COMPLETED",
            result: "PLAYER1_WIN",
            winnerId: testPlayers[0].userId,
            duration: 2400,
            createdAt: new Date(),
            startedAt: new Date(),
            finishedAt: new Date(),
          },
        }),
      ]);

      // Now test the completion
      const result = await TournamentCompletionService.completeTournament(
        testTournament.id
      );

      logger.info("Test tournament completion result", {
        tournamentId: testTournament.id,
        result,
      });

      res.json({
        success: true,
        message: "Test tournament created and completed",
        data: {
          tournamentId: testTournament.id,
          result,
          matches: matches.length,
          players: testPlayers.length,
        },
      });
    } catch (error) {
      logger.error("Error in test tournament completion", { error });

      res.status(500).json({
        success: false,
        message: "Failed to test tournament completion",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

export default router;
