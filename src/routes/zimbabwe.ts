import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import { asyncHandler } from "../middleware/errorHandler";
import logger from "../config/logger";

const router = Router();

// GET /api/zimbabwe/provinces - Get all Zimbabwe provinces
router.get(
  "/provinces",
  asyncHandler(async (req: Request, res: Response) => {
    const provinces = [
      "Harare",
      "Bulawayo",
      "Manicaland",
      "Mashonaland Central",
      "Mashonaland East",
      "Mashonaland West",
      "Masvingo",
      "Matabeleland North",
      "Matabeleland South",
      "Midlands",
    ];

    res.json({
      success: true,
      data: { provinces },
    });
  })
);

// GET /api/zimbabwe/cities/:province - Get cities in a province
router.get(
  "/cities/:province",
  asyncHandler(async (req: Request, res: Response) => {
    const { province } = req.params;

    // Static city data for Zimbabwe (you can expand this or move to database)
    const citiesByProvince: Record<string, string[]> = {
      Harare: ["Harare", "Chitungwiza", "Epworth", "Ruwa"],
      Bulawayo: ["Bulawayo"],
      Manicalland: ["Mutare", "Rusape", "Chipinge", "Nyanga"],
      "Mashonaland Central": ["Bindura", "Mount Darwin", "Guruve", "Shamva"],
      "Mashonaland East": ["Marondera", "Macheke", "Wedza", "Mudzi"],
      "Mashonaland West": ["Chinhoyi", "Kariba", "Norton", "Chegutu"],
      Masvingo: ["Masvingo", "Chivi", "Bikita", "Zaka"],
      "Matabeleland North": ["Hwange", "Victoria Falls", "Binga", "Lupane"],
      "Matabeleland South": ["Gwanda", "Beitbridge", "Plumtree", "Filabusi"],
      Midlands: ["Gweru", "Kwekwe", "Redcliff", "Shurugwi"],
    };

    const cities = citiesByProvince[province] || [];

    res.json({
      success: true,
      data: { cities, province },
    });
  })
);

// GET /api/zimbabwe/institutions - Get all institutions
router.get(
  "/institutions",
  asyncHandler(async (req: Request, res: Response) => {
    const { type, province, city } = req.query;

    const where: any = { isActive: true };
    if (type) where.type = type;
    if (province) where.province = province;
    if (city) where.city = city;

    const institutions = await prisma.institution.findMany({
      where,
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    res.json({
      success: true,
      data: { institutions },
    });
  })
);

// GET /api/zimbabwe/universities - Get universities only
router.get(
  "/universities",
  asyncHandler(async (req: Request, res: Response) => {
    const universities = await prisma.institution.findMany({
      where: {
        type: "university",
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    res.json({
      success: true,
      data: { universities },
    });
  })
);

// GET /api/zimbabwe/mobile-money-providers - Get mobile money providers
router.get(
  "/mobile-money-providers",
  asyncHandler(async (req: Request, res: Response) => {
    const providers = await prisma.mobileMoneyProvider.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    res.json({
      success: true,
      data: { providers },
    });
  })
);

// GET /api/zimbabwe/demographics - Get user demographics (basic analytics)
router.get(
  "/demographics",
  asyncHandler(async (req: Request, res: Response) => {
    const [totalUsers, usersByProvince, usersByInstitution, studentCount] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.groupBy({
          by: ["province"],
          _count: { id: true },
          where: { province: { not: null } },
        }),
        prisma.user.groupBy({
          by: ["institution"],
          _count: { id: true },
          where: { institution: { not: null } },
          orderBy: { _count: { id: "desc" } },
          take: 10,
        }),
        prisma.user.count({ where: { isStudent: true } }),
      ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        studentCount,
        nonStudentCount: totalUsers - studentCount,
        usersByProvince: usersByProvince.map((item) => ({
          province: item.province,
          count: item._count.id,
        })),
        topInstitutions: usersByInstitution.map((item) => ({
          institution: item.institution,
          count: item._count.id,
        })),
      },
    });
  })
);

// GET /api/zimbabwe/popular-games - Get popular games by region
router.get(
  "/popular-games",
  asyncHandler(async (req: Request, res: Response) => {
    const { province } = req.query;

    const where: any = {};
    if (province) {
      where.user = { province };
    }

    const popularGames = await prisma.gameStatistic.groupBy({
      by: ["gameId"],
      _sum: { gamesPlayed: true },
      _count: { userId: true },
      where,
      orderBy: {
        _sum: { gamesPlayed: "desc" },
      },
      take: 10,
    });

    // Get game details
    const gameIds = popularGames.map((item) => item.gameId);
    const games = await prisma.game.findMany({
      where: { id: { in: gameIds } },
      select: {
        id: true,
        name: true,
        emoji: true,
        description: true,
      },
    });

    const gamesMap = new Map(games.map((game) => [game.id, game]));

    const result = popularGames.map((item) => ({
      game: gamesMap.get(item.gameId),
      totalGamesPlayed: item._sum.gamesPlayed || 0,
      totalPlayers: item._count.userId,
    }));

    res.json({
      success: true,
      data: {
        popularGames: result,
        province: province || "All Zimbabwe",
      },
    });
  })
);

export default router;
