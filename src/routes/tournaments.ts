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
          orderBy: [{ round: "asc" }, { createdAt: "asc" }],
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
            totalPlayers: tournament.players.length,
            totalMatches: tournament.matches.length,
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

    // CRITICAL FIX: Check if tournament requires payment
    if (tournament.entryFee > 0) {
      res.status(400).json({
        success: false,
        message:
          "Payment required. Use /api/payments/initiate-tournament-entry",
        data: {
          entryFee: tournament.entryFee,
          currency: tournament.localCurrency || "USD",
          requiresPayment: true,
          paymentEndpoint: "/api/payments/initiate-tournament-entry",
        },
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

    // Create tournament player registration (only for free tournaments)
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
          orderBy: [{ round: "asc" }, { createdAt: "asc" }],
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

    // If tournament has a bracket structure, populate it with actual match data
    let populatedBracket = tournament.bracket;
    if (tournament.bracket && tournament.matches) {
      try {
        const bracket = tournament.bracket as any;

        // Populate each round with actual match data
        if (bracket.rounds && Array.isArray(bracket.rounds)) {
          bracket.rounds.forEach((round: any) => {
            if (round.matches && Array.isArray(round.matches)) {
              round.matches.forEach((bracketMatch: any) => {
                // Find corresponding database match by round and match position
                const roundMatches = tournament.matches.filter(
                  (m) => m.round === round.round
                );

                // Try to find match by ID first, then by position
                let dbMatch = null;
                if (
                  bracketMatch.id &&
                  bracketMatch.id !==
                    `round${round.round}_match${bracketMatch.matchNumber}`
                ) {
                  // If bracket has a real match ID, find it directly
                  dbMatch = roundMatches.find((m) => m.id === bracketMatch.id);
                } else {
                  // Find by position in round
                  const matchIndex = bracketMatch.matchNumber
                    ? bracketMatch.matchNumber - 1
                    : 0;
                  dbMatch = roundMatches[matchIndex];
                }

                if (dbMatch) {
                  // Populate bracket match with actual data
                  bracketMatch.id = dbMatch.id;
                  bracketMatch.player1Id = dbMatch.player1?.id || null;
                  bracketMatch.player2Id = dbMatch.player2?.id || null;
                  bracketMatch.status = dbMatch.status;
                  bracketMatch.winnerId = dbMatch.winnerId;
                  bracketMatch.createdAt = dbMatch.createdAt;

                  // Add player info for display
                  bracketMatch.player1Info = dbMatch.player1;
                  bracketMatch.player2Info = dbMatch.player2;
                } else if (round.round > 1) {
                  // For subsequent rounds, try to populate from previous round winners
                  // This is a simplified approach - in production you'd want a more sophisticated winner advancement system
                  bracketMatch.status = "PENDING";
                  bracketMatch.player1Info = null;
                  bracketMatch.player2Info = null;
                }
              });
            }
          });
        }

        populatedBracket = bracket;
      } catch (error) {
        console.error("Error populating bracket:", error);
        // Continue with original bracket if population fails
      }
    }

    res.json({
      success: true,
      data: {
        tournament: {
          id: tournament.id,
          title: tournament.title,
          status: tournament.status,
          bracketType: tournament.bracketType,
          bracket: populatedBracket,
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

// POST /api/tournaments/:id/start - Start tournament manually (admin only)
router.post(
  "/:id/start",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { _count: { select: { players: true } } },
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }

    if (tournament.status !== "CLOSED") {
      return res.status(400).json({
        success: false,
        message: "Tournament must be in CLOSED status to start",
      });
    }

    if (tournament._count.players < 2) {
      return res.status(400).json({
        success: false,
        message: "Minimum 2 players required to start tournament",
      });
    }

    try {
      const { TournamentStatusService } = await import(
        "../services/TournamentStatusService"
      );

      await TournamentStatusService.startTournament(id);

      res.json({
        success: true,
        message: "Tournament started successfully",
        data: { tournamentId: id },
      });
    } catch (error) {
      logger.error("Error starting tournament", {
        tournamentId: id,
        adminId: req.user!.id,
        error,
      });

      res.status(500).json({
        success: false,
        message: "Failed to start tournament",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// POST /api/tournaments/:id/bracket/generate - Generate bracket (admin only)
router.post(
  "/:id/bracket/generate",
  authenticate,
  adminOnly,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const { BracketGenerationService } = await import(
        "../services/BracketGenerationService"
      );
      const bracket = await BracketGenerationService.generateBracket(id);

      const updatedTournament = await prisma.tournament.findUnique({
        where: { id },
        include: {
          players: { include: { user: true } },
          matches: { include: { player1: true, player2: true } },
        },
      });

      res.json({
        success: true,
        message: "Bracket generated successfully",
        data: {
          tournament: updatedTournament,
          bracket,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to generate bracket",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// POST /api/tournaments/:id/regenerate-bracket - Regenerate tournament bracket
router.post(
  "/:id/regenerate-bracket",
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const { BracketGenerationService } = await import(
        "../services/BracketGenerationService"
      );
      const bracket = await BracketGenerationService.regenerateBracket(id);

      res.json({
        success: true,
        message: "Bracket regenerated successfully",
        data: {
          bracket,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || "Failed to regenerate bracket",
      });
    }
  })
);

// GET /api/tournaments/:id/status - Get tournament status and transition info
router.get(
  "/:id/status",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const { TournamentStatusService } = await import(
        "../services/TournamentStatusService"
      );

      const transitions =
        await TournamentStatusService.getTournamentsNeedingTransitions();

      const tournament = await prisma.tournament.findUnique({
        where: { id },
        include: {
          _count: { select: { players: true } },
          players: { include: { user: true } },
        },
      });

      if (!tournament) {
        return res.status(404).json({
          success: false,
          message: "Tournament not found",
        });
      }

      res.json({
        success: true,
        message: "Tournament status retrieved successfully",
        data: {
          tournament,
          systemStatus: {
            transitions,
            lastChecked: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to get tournament status",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// POST /api/tournaments/:id/matches/:matchId/result - Update match result
router.post(
  "/:id/matches/:matchId/result",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId, matchId } = req.params;
    const { winnerId, result, duration, metadata } = req.body;

    try {
      const { TournamentMatchService } = await import(
        "../services/TournamentMatchService"
      );

      await TournamentMatchService.updateMatchResult(matchId, {
        winnerId,
        result,
        duration,
        metadata,
      });

      res.json({
        success: true,
        message: "Match result updated successfully",
        data: { matchId, winnerId },
      });
    } catch (error) {
      logger.error("Error updating match result", {
        tournamentId,
        matchId,
        error,
      });

      res.status(500).json({
        success: false,
        message: "Failed to update match result",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/:id/matches - Get tournament matches
router.get(
  "/:id/matches",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;

    try {
      const { TournamentMatchService } = await import(
        "../services/TournamentMatchService"
      );

      const matches = await TournamentMatchService.getTournamentMatches(
        tournamentId
      );
      const progress = await TournamentMatchService.getTournamentProgress(
        tournamentId
      );

      res.json({
        success: true,
        message: "Tournament matches retrieved successfully",
        data: {
          matches,
          progress,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve tournament matches",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/:id/progress - Get tournament progress
router.get(
  "/:id/progress",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;

    try {
      const { TournamentMatchService } = await import(
        "../services/TournamentMatchService"
      );

      const progress = await TournamentMatchService.getTournamentProgress(
        tournamentId
      );

      res.json({
        success: true,
        message: "Tournament progress retrieved successfully",
        data: progress,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve tournament progress",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// 🇿🇼 ZIMBABWE-SPECIFIC TOURNAMENT ENDPOINTS

// POST /api/tournaments/zimbabwe/create - Create Zimbabwe-specific tournament
router.post(
  "/zimbabwe/create",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { ZimbabweTournamentService } = await import(
        "../services/ZimbabweTournamentService"
      );

      const tournament =
        await ZimbabweTournamentService.createZimbabweTournament(req.body);

      res.json({
        success: true,
        message: "Zimbabwe tournament created successfully",
        data: { tournament },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to create Zimbabwe tournament",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// POST /api/tournaments/zimbabwe/university/create - Create inter-university tournament
router.post(
  "/zimbabwe/university/create",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { ZimbabweTournamentService } = await import(
        "../services/ZimbabweTournamentService"
      );

      const tournament =
        await ZimbabweTournamentService.createInterUniversityTournament(
          req.body
        );

      res.json({
        success: true,
        message: "Inter-university tournament created successfully",
        data: { tournament },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to create inter-university tournament",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// POST /api/tournaments/zimbabwe/regional/create - Create regional tournament
router.post(
  "/zimbabwe/regional/create",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { ZimbabweTournamentService } = await import(
        "../services/ZimbabweTournamentService"
      );

      const tournament =
        await ZimbabweTournamentService.createRegionalTournament(req.body);

      res.json({
        success: true,
        message: "Regional tournament created successfully",
        data: { tournament },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to create regional tournament",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/zimbabwe/region - Get tournaments by Zimbabwe region
router.get(
  "/zimbabwe/region",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { province, city, radius } = req.query;

    try {
      const { ZimbabweTournamentService } = await import(
        "../services/ZimbabweTournamentService"
      );

      const tournaments =
        await ZimbabweTournamentService.getTournamentsByRegion(
          province as string,
          city as string,
          radius ? Number(radius) : undefined
        );

      res.json({
        success: true,
        message: "Regional tournaments retrieved successfully",
        data: { tournaments },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve regional tournaments",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/zimbabwe/university - Get university tournaments
router.get(
  "/zimbabwe/university",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { institutionId } = req.query;

    try {
      const { ZimbabweTournamentService } = await import(
        "../services/ZimbabweTournamentService"
      );

      const tournaments =
        await ZimbabweTournamentService.getUniversityTournaments(
          institutionId as string
        );

      res.json({
        success: true,
        message: "University tournaments retrieved successfully",
        data: { tournaments },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve university tournaments",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/zimbabwe/corporate - Get corporate tournaments
router.get(
  "/zimbabwe/corporate",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { ZimbabweTournamentService } = await import(
        "../services/ZimbabweTournamentService"
      );

      const tournaments =
        await ZimbabweTournamentService.getCorporateTournaments();

      res.json({
        success: true,
        message: "Corporate tournaments retrieved successfully",
        data: { tournaments },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve corporate tournaments",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/zimbabwe/stats - Get Zimbabwe tournament statistics
router.get(
  "/zimbabwe/stats",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { ZimbabweTournamentService } = await import(
        "../services/ZimbabweTournamentService"
      );

      const stats =
        await ZimbabweTournamentService.getZimbabweTournamentStats();

      res.json({
        success: true,
        message: "Zimbabwe tournament statistics retrieved successfully",
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve Zimbabwe tournament statistics",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// 🕐 ZIMBABWE SCHEDULING ENDPOINTS

// GET /api/tournaments/zimbabwe/schedule/suggest - Get optimal tournament times
router.get(
  "/zimbabwe/schedule/suggest",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      province,
      city,
      targetAudience,
      preferredTime,
      maxDuration,
      isWeekend,
    } = req.query;

    try {
      const { ZimbabweSchedulingService } = await import(
        "../services/ZimbabweSchedulingService"
      );

      const suggestions =
        await ZimbabweSchedulingService.suggestOptimalTournamentTime({
          province: province as string,
          city: city as string,
          targetAudience: targetAudience as
            | "university"
            | "corporate"
            | "public",
          preferredTime: preferredTime as
            | "morning"
            | "afternoon"
            | "evening"
            | "night",
          maxDuration: maxDuration ? Number(maxDuration) : undefined,
          isWeekend: isWeekend === "true",
        });

      res.json({
        success: true,
        message: "Optimal tournament times suggested successfully",
        data: { suggestions },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to suggest optimal tournament times",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// 📱 OFFLINE TOURNAMENT ENDPOINTS

// POST /api/tournaments/:id/offline/cache - Cache tournament for offline play
router.post(
  "/:id/offline/cache",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;
    const userId = (req as any).user.id;

    try {
      const { OfflineTournamentService } = await import(
        "../services/OfflineTournamentService"
      );

      const offlineData =
        await OfflineTournamentService.cacheTournamentForOffline(
          tournamentId,
          userId
        );

      res.json({
        success: true,
        message: "Tournament cached for offline play successfully",
        data: { offlineData },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to cache tournament for offline play",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// POST /api/tournaments/:id/offline/sync - Sync offline tournament results
router.post(
  "/:id/offline/sync",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;
    const { offlineResults } = req.body;
    const userId = (req as any).user.id;

    try {
      const { OfflineTournamentService } = await import(
        "../services/OfflineTournamentService"
      );

      const syncResult = await OfflineTournamentService.syncOfflineResults(
        tournamentId,
        userId,
        offlineResults
      );

      res.json({
        success: true,
        message: "Offline results synced successfully",
        data: { syncResult },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to sync offline results",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/:id/offline/can-play - Check if tournament can be played offline
router.get(
  "/:id/offline/can-play",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;
    const userId = (req as any).user.id;

    try {
      const { OfflineTournamentService } = await import(
        "../services/OfflineTournamentService"
      );

      const offlineCapability = await OfflineTournamentService.canPlayOffline(
        tournamentId,
        userId
      );

      res.json({
        success: true,
        message: "Offline capability checked successfully",
        data: { offlineCapability },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to check offline capability",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/offline/recommendations - Get offline play recommendations
router.get(
  "/offline/recommendations",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { OfflineTournamentService } = await import(
        "../services/OfflineTournamentService"
      );

      const recommendations =
        OfflineTournamentService.getOfflinePlayRecommendations();

      res.json({
        success: true,
        message: "Offline play recommendations retrieved successfully",
        data: { recommendations },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve offline play recommendations",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// 🏭 PHASE 4: INDUSTRY-STANDARD TOURNAMENT FEATURES

// GET /api/tournaments/:id/swiss-standings - Get Swiss system standings
router.get(
  "/:id/swiss-standings",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;

    try {
      const { SwissSystemService } = await import(
        "../services/SwissSystemService"
      );

      const standings = await SwissSystemService.getSwissStandings(
        tournamentId
      );

      res.json({
        success: true,
        message: "Swiss system standings retrieved successfully",
        data: standings,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve Swiss system standings",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// POST /api/tournaments/:id/swiss-round - Generate next Swiss round
router.post(
  "/:id/swiss-round",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;
    const { roundNumber } = req.body;

    if (!roundNumber || typeof roundNumber !== "number") {
      return res.status(400).json({
        success: false,
        message: "Round number is required",
      });
    }

    try {
      const { SwissSystemService } = await import(
        "../services/SwissSystemService"
      );

      const round = await SwissSystemService.generateSwissRound(
        tournamentId,
        roundNumber
      );

      res.json({
        success: true,
        message: "Swiss round generated successfully",
        data: round,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to generate Swiss round",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/:id/ratings - Get tournament player ratings
router.get(
  "/:id/ratings",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;

    try {
      const { RatingService } = await import("../services/RatingService");

      const seeding = await RatingService.calculateTournamentSeeding(
        tournamentId
      );

      res.json({
        success: true,
        message: "Tournament ratings retrieved successfully",
        data: seeding,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve tournament ratings",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// POST /api/tournaments/:id/update-ratings - Update ratings after tournament
router.post(
  "/:id/update-ratings",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;

    try {
      const { RatingService } = await import("../services/RatingService");

      await RatingService.updateTournamentRatings(tournamentId);

      res.json({
        success: true,
        message: "Tournament ratings updated successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to update tournament ratings",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/tournaments/:id/anti-cheat - Analyze tournament for cheating
router.get(
  "/:id/anti-cheat",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;

    try {
      const { AntiCheatService } = await import("../services/AntiCheatService");

      // Get all matches in the tournament
      const matches = await prisma.match.findMany({
        where: { tournamentId, status: "COMPLETED" },
        select: { id: true },
      });

      const results = [];
      for (const match of matches) {
        const matchResults = await AntiCheatService.analyzeMatch(match.id);
        results.push(...matchResults);
      }

      res.json({
        success: true,
        message: "Anti-cheat analysis completed successfully",
        data: results,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to complete anti-cheat analysis",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/players/:id/behavior - Get player behavior analysis
router.get(
  "/players/:id/behavior",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: userId } = req.params;

    try {
      const { AntiCheatService } = await import("../services/AntiCheatService");

      const behavior = await AntiCheatService.getPlayerBehaviorAnalysis(userId);

      res.json({
        success: true,
        message: "Player behavior analysis retrieved successfully",
        data: behavior,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve player behavior analysis",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// GET /api/games/:id/rating-distribution - Get rating distribution for a game
router.get(
  "/games/:id/rating-distribution",
  authenticate,
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: gameId } = req.params;

    try {
      const { RatingService } = await import("../services/RatingService");

      const distribution = await RatingService.getRatingDistribution(gameId);

      res.json({
        success: true,
        message: "Rating distribution retrieved successfully",
        data: distribution,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve rating distribution",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

// Tournament Social Features
router.get("/:id/social", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Get tournament social events from the new table
    const events = await prisma.$queryRaw`
      SELECT 
        te.id,
        te.type,
        te.message,
        te.metadata,
        te.created_at as "timestamp",
        u.username as "playerName",
        u.avatar as "playerAvatar"
      FROM tournament_events te
      JOIN users u ON te.user_id = u.id
      WHERE te.tournament_id = ${id}
      ORDER BY te.created_at DESC
      LIMIT ${Number(limit)}
      OFFSET ${(Number(page) - 1) * Number(limit)}
    `;

    // Get total count
    const totalResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM tournament_events WHERE tournament_id = ${id}
    `;
    const total = Number((totalResult as any)[0]?.count || 0);

    res.json({
      events: (events as any[]).map((event: any) => ({
        id: event.id,
        type: event.type,
        message: event.message,
        playerName: event.playerName,
        playerAvatar: event.playerAvatar,
        timestamp: event.timestamp,
        data: event.metadata,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error("Failed to get tournament social events", {
      error,
      tournamentId: req.params.id,
    });
    res.status(500).json({ error: "Failed to get social events" });
  }
});

router.get("/:id/highlights", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Get tournament highlights using proper Prisma ORM
    const highlights = await prisma.tournamentHighlight.findMany({
      where: { tournamentId: id },
      include: {
        user: {
          select: {
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    // Get total count
    const total = await prisma.tournamentHighlight.count({
      where: { tournamentId: id },
    });

    res.json({
      highlights: highlights.map((highlight) => ({
        id: highlight.id,
        playerId: highlight.userId,
        playerName: highlight.user.username,
        playerAvatar: highlight.user.avatar,
        achievement: highlight.achievement,
        description: highlight.description,
        timestamp: highlight.createdAt,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error("Failed to get tournament highlights", {
      error,
      tournamentId: req.params.id,
    });
    res.status(500).json({ error: "Failed to get highlights" });
  }
});

router.get("/:id/spectators", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get current spectator count using proper Prisma ORM
    const spectatorCount = await prisma.tournamentSpectator.count({
      where: {
        tournamentId: id,
        isActive: true,
      },
    });

    res.json({
      spectatorCount,
      isLive: true,
      lastUpdated: new Date(),
    });
  } catch (error) {
    logger.error("Failed to get tournament spectators", {
      error,
      tournamentId: req.params.id,
    });
    res.status(500).json({ error: "Failed to get spectator count" });
  }
});

router.get(
  "/:id/offline-data",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Get tournament data for offline mode
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
                },
              },
              player2: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
        },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      // Check if tournament supports offline mode
      const offlineCapable = ["Chess", "Checkers", "TicTacToe"].includes(
        tournament.game?.name || ""
      );

      if (!offlineCapable) {
        return res
          .status(400)
          .json({ error: "Tournament does not support offline mode" });
      }

      const offlineData = {
        tournamentId: tournament.id,
        tournamentName: tournament.title,
        gameType: tournament.game?.name || "Unknown",
        bracket: tournament.bracket || { rounds: [], totalRounds: 0 },
        players: tournament.players.map((p) => ({
          id: p.user.id,
          username: p.user.username,
          avatar: p.user.avatar,
        })),
        matches: tournament.matches.map((m) => ({
          id: m.id,
          player1Id: m.player1.id,
          player2Id: m.player2.id,
          status: m.status,
          result: m.result,
        })),
        rules: {
          timeControl: "10+0", // Default since not in schema
          format: "Single Elimination", // Default since not in schema
          maxPlayers: tournament.maxPlayers,
        },
        lastSync: new Date(),
        offlineCapable: true,
      };

      res.json(offlineData);
    } catch (error) {
      logger.error("Failed to get tournament offline data", {
        error,
        tournamentId: req.params.id,
      });
      res.status(500).json({ error: "Failed to get offline data" });
    }
  })
);

router.get(
  "/:id/offline-capability",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const tournament = await prisma.tournament.findUnique({
        where: { id },
        include: { game: true },
      });

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      const supportedGames = ["Chess", "Checkers", "TicTacToe"];
      const offlineCapable = supportedGames.includes(
        tournament.game?.name || ""
      );

      res.json({
        offlineCapable,
        gameType: tournament.game?.name || "Unknown",
        reason: offlineCapable
          ? null
          : "Game type not supported for offline play",
      });
    } catch (error) {
      logger.error("Failed to check tournament offline capability", {
        error,
        tournamentId: req.params.id,
      });
      res.status(500).json({ error: "Failed to check offline capability" });
    }
  })
);

// GET /api/tournaments/:id/winners - Get tournament winners
router.get(
  "/:id/winners",
  validateParams(paramSchemas.id),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: tournamentId } = req.params;

    try {
      const { TournamentMatchService } = await import(
        "../services/TournamentMatchService"
      );

      const winners = await TournamentMatchService.getTournamentWinners(
        tournamentId
      );

      res.json({
        success: true,
        message: "Tournament winners retrieved successfully",
        data: winners,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve tournament winners",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })
);

export default router;
