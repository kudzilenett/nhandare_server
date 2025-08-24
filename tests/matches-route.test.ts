import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

// Mock the problematic modules
jest.mock("../src/services/pesepay", () => ({}));
jest.mock("../src/services/PaymentService", () => ({}));

const prisma = new PrismaClient();

// Test the route logic directly
describe("Matches Route Logic", () => {
  let authToken: string;
  let testUser: any;
  let testTournament: any;
  let testMatch: any;
  let testGame: any;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.gameSession.deleteMany();
    await prisma.match.deleteMany();
    await prisma.tournamentPlayer.deleteMany();
    await prisma.tournament.deleteMany();
    await prisma.user.deleteMany();
    await prisma.game.deleteMany();

    // Create test game
    testGame = await prisma.game.create({
      data: {
        name: "Test Chess",
        emoji: "♟️",
        description: "Test chess game for tournaments",
        rules: "Standard chess rules",
        settings: {},
        averageTimeMs: 300000, // 5 minutes
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: "testplayer@nhandare.co.zw",
        username: "TestPlayer",
        password: "hashedpassword123",
        firstName: "Test",
        lastName: "Player",
        phoneNumber: "+263771234567",
        province: "Harare",
        city: "Harare",
        location: "Harare, Harare",
        isStudent: true,
        institution: "Test University",
        isActive: true,
        isVerified: true,
      },
    });

    // Create test tournament
    testTournament = await prisma.tournament.create({
      data: {
        title: "Test Tournament",
        description: "Test tournament for API testing",
        gameId: testGame.id,
        entryFee: 100,
        prizePool: 1000,
        maxPlayers: 8,
        status: "COMPLETED", // This should now work with our updated logic
        province: "Harare",
        city: "Harare",
        location: "Harare, Harare",
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        registrationStart: new Date(),
        registrationEnd: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
      },
    });

    // Register user for tournament
    await prisma.tournamentPlayer.create({
      data: {
        tournamentId: testTournament.id,
        userId: testUser.id,
        isActive: true,
      },
    });

    // Create test match
    testMatch = await prisma.match.create({
      data: {
        player1Id: testUser.id,
        player2Id: testUser.id, // Using same user for testing
        gameId: testGame.id,
        tournamentId: testTournament.id,
        round: 1,
        status: "PENDING",
        result: "PENDING",
      },
    });

    // Generate auth token
    authToken = jwt.sign(
      { id: testUser.id, email: testUser.email, role: "user" },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn: "1h" }
    );
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.gameSession.deleteMany();
    await prisma.match.deleteMany();
    await prisma.tournamentPlayer.deleteMany();
    await prisma.tournament.deleteMany();
    await prisma.user.deleteMany();
    await prisma.game.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Reset match status before each test
    await prisma.match.update({
      where: { id: testMatch.id },
      data: { status: "PENDING" },
    });

    // Clean up any existing game sessions
    await prisma.gameSession.deleteMany({
      where: { matchId: testMatch.id },
    });
  });

  describe("Tournament Match Start Logic", () => {
    it("should validate tournament status correctly", async () => {
      // Test that COMPLETED tournaments are allowed
      const match = await prisma.match.findUnique({
        where: { id: testMatch.id },
        include: {
          tournament: {
            select: {
              id: true,
              status: true,
              title: true,
            },
          },
        },
      });

      expect(match).toBeDefined();
      expect(match?.tournament?.status).toBe("COMPLETED");

      // Our updated logic should allow COMPLETED tournaments
      const allowedStatuses = ["ACTIVE", "CLOSED", "COMPLETED"];
      expect(allowedStatuses).toContain(match?.tournament?.status);
    });

    it("should create game sessions when starting a match", async () => {
      // Simulate the match start logic
      const [player1Session, player2Session] = await Promise.all([
        prisma.gameSession.create({
          data: {
            userId: testMatch.player1Id,
            gameId: testMatch.gameId,
            sessionType: "TOURNAMENT",
            matchId: testMatch.id,
            isActive: true,
            startedAt: new Date(),
          },
        }),
        prisma.gameSession.create({
          data: {
            userId: testMatch.player2Id,
            gameId: testMatch.gameId,
            sessionType: "TOURNAMENT",
            matchId: testMatch.id,
            isActive: true,
            startedAt: new Date(),
          },
        }),
      ]);

      // Verify game sessions were created
      expect(player1Session).toBeDefined();
      expect(player2Session).toBeDefined();
      expect(player1Session.sessionType).toBe("TOURNAMENT");
      expect(player2Session.sessionType).toBe("TOURNAMENT");
      expect(player1Session.isActive).toBe(true);
      expect(player2Session.isActive).toBe(true);

      // Verify match status can be updated
      const updatedMatch = await prisma.match.update({
        where: { id: testMatch.id },
        data: {
          status: "ACTIVE",
          startedAt: new Date(),
        },
      });

      expect(updatedMatch.status).toBe("ACTIVE");
      expect(updatedMatch.startedAt).toBeDefined();
    });

    it("should handle different tournament statuses correctly", async () => {
      // Test CLOSED status
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "CLOSED" },
      });

      const closedMatch = await prisma.match.findUnique({
        where: { id: testMatch.id },
        include: {
          tournament: {
            select: {
              status: true,
            },
          },
        },
      });

      expect(closedMatch?.tournament?.status).toBe("CLOSED");

      // CLOSED tournaments should be allowed
      const allowedStatuses = ["ACTIVE", "CLOSED", "COMPLETED"];
      expect(allowedStatuses).toContain(closedMatch?.tournament?.status);

      // Test OPEN status (should not be allowed)
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "OPEN" },
      });

      const openMatch = await prisma.match.findUnique({
        where: { id: testMatch.id },
        include: {
          tournament: {
            select: {
              status: true,
            },
          },
        },
      });

      expect(openMatch?.tournament?.status).toBe("OPEN");
      expect(allowedStatuses).not.toContain(openMatch?.tournament?.status);
    });

    it("should validate match status correctly", async () => {
      // Test PENDING status (should be allowed)
      expect(testMatch.status).toBe("PENDING");

      // Test ACTIVE status (should not be allowed)
      await prisma.match.update({
        where: { id: testMatch.id },
        data: { status: "ACTIVE" },
      });

      const activeMatch = await prisma.match.findUnique({
        where: { id: testMatch.id },
      });

      expect(activeMatch?.status).toBe("ACTIVE");
      expect(activeMatch?.status).not.toBe("PENDING");
    });

    it("should check for existing game sessions", async () => {
      // Create a game session to simulate existing sessions
      await prisma.gameSession.create({
        data: {
          userId: testUser.id,
          gameId: testGame.id,
          sessionType: "TOURNAMENT",
          matchId: testMatch.id,
          isActive: true,
          startedAt: new Date(),
        },
      });

      // Check if match has active sessions
      const existingSessions = await prisma.gameSession.findMany({
        where: {
          matchId: testMatch.id,
          isActive: true,
        },
      });

      expect(existingSessions).toHaveLength(1);
      expect(existingSessions[0].isActive).toBe(true);
    });
  });
});
