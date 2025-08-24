import request from "supertest";
import { app } from "../src/index";
import { PrismaClient } from "@prisma/client";
import { generateToken } from "../src/middleware/auth";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";

const prisma = new PrismaClient();

describe("Tournament Integration Tests", () => {
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
    await prisma.$executeRaw`DELETE FROM "user_moderations" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "payments" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "game_statistics" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "challenge_invitations" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "audit_logs" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "tournament_chat_messages" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "tournament_events" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "tournament_highlights" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "tournament_spectators" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "user_achievements" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "user_activities" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "flagged_content" WHERE 1=1`;
    await prisma.user.deleteMany();
    await prisma.game.deleteMany();

    // Create test game
    testGame = await prisma.game.create({
      data: {
        name: "Chess",
        emoji: "♟️",
        description: "Chess game for tournaments",
        rules: "Standard chess rules",
        settings: {},
        averageTimeMs: 600000, // 10 minutes
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: "player@nhandare.co.zw",
        username: "ChessPlayer",
        password: "hashedpassword123",
        firstName: "Chess",
        lastName: "Player",
        phoneNumber: "+263771234567",
        province: "Harare",
        city: "Harare",
        location: "Harare, Harare",
        isStudent: false,
        isActive: true,
        isVerified: true,
      },
    });

    // Generate auth token
    authToken = generateToken({
      id: testUser.id,
      email: testUser.email,
      username: testUser.username,
      role: "user",
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.gameSession.deleteMany();
    await prisma.match.deleteMany();
    await prisma.tournamentPlayer.deleteMany();
    await prisma.tournament.deleteMany();
    await prisma.$executeRaw`DELETE FROM "user_moderations" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "payments" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "game_statistics" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "challenge_invitations" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "audit_logs" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "tournament_chat_messages" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "tournament_events" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "tournament_highlights" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "tournament_spectators" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "user_achievements" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "user_activities" WHERE 1=1`;
    await prisma.$executeRaw`DELETE FROM "flagged_content" WHERE 1=1`;
    await prisma.user.deleteMany();
    await prisma.game.deleteMany();
    await prisma.$disconnect();
  });

  describe("Complete Tournament Match Starting Flow", () => {
    it("should handle the complete tournament workflow", async () => {
      // 1. Create tournament in ACTIVE status (ready for matches)
      testTournament = await prisma.tournament.create({
        data: {
          title: "Chess Championship",
          description: "Professional chess tournament",
          gameId: testGame.id,
          entryFee: 25,
          prizePool: 500,
          maxPlayers: 8,
          status: "ACTIVE", // Tournament is active and ready for matches
          province: "Harare",
          city: "Harare",
          location: "Harare Sports Club",
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          registrationStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
          registrationEnd: new Date(Date.now() - 1 * 60 * 60 * 1000),
        },
      });

      // 2. Register user for tournament
      await prisma.tournamentPlayer.create({
        data: {
          tournamentId: testTournament.id,
          userId: testUser.id,
          isActive: true,
        },
      });

      // 3. Create tournament match (simulating bracket generation)
      testMatch = await prisma.match.create({
        data: {
          player1Id: testUser.id,
          player2Id: testUser.id, // Self-match for testing
          gameId: testGame.id,
          tournamentId: testTournament.id,
          round: 1,
          status: "PENDING", // Ready to start
          result: "PENDING",
        },
      });

      // 4. Start the tournament match
      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      // 5. Verify response structure (this is what frontend expects)
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(
        "Tournament match started successfully"
      );
      expect(response.body.data).toMatchObject({
        matchId: testMatch.id,
        gameSessionId: expect.any(String),
        playerColor: expect.stringMatching(/^(white|black)$/),
        tournamentId: testTournament.id,
        gameName: testGame.name,
      });

      // 6. Verify database state
      const updatedMatch = await prisma.match.findUnique({
        where: { id: testMatch.id },
      });
      expect(updatedMatch?.status).toBe("ACTIVE");
      expect(updatedMatch?.startedAt).toBeDefined();

      // 7. Verify game sessions were created
      const gameSessions = await prisma.gameSession.findMany({
        where: { matchId: testMatch.id },
      });
      expect(gameSessions).toHaveLength(2);
      expect(gameSessions.every((s) => s.isActive)).toBe(true);
      expect(gameSessions.every((s) => s.sessionType === "TOURNAMENT")).toBe(
        true
      );

      // 8. Verify the user gets the correct session
      const userSession = gameSessions.find((s) => s.userId === testUser.id);
      expect(userSession).toBeDefined();
      expect(response.body.data.gameSessionId).toBe(userSession?.id);
    });

    it("should handle different tournament statuses correctly", async () => {
      // Test COMPLETED tournament status
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "COMPLETED" },
      });

      // Reset match status
      await prisma.match.update({
        where: { id: testMatch.id },
        data: { status: "PENDING" },
      });

      // Clean up existing sessions
      await prisma.gameSession.deleteMany({
        where: { matchId: testMatch.id },
      });

      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(
        "Tournament match started successfully"
      );
    });

    it("should provide helpful error messages for troubleshooting", async () => {
      // Test OPEN tournament status (common user error)
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "OPEN" },
      });

      // Reset match status
      await prisma.match.update({
        where: { id: testMatch.id },
        data: { status: "PENDING" },
      });

      // Clean up existing sessions
      await prisma.gameSession.deleteMany({
        where: { matchId: testMatch.id },
      });

      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain(
        "OPEN status and cannot start matches"
      );
      expect(response.body.tournamentStatus).toBe("OPEN");
      expect(response.body.allowedStatuses).toEqual([
        "ACTIVE",
        "CLOSED",
        "COMPLETED",
      ]);
    });

    it("should validate match status properly", async () => {
      // Update tournament back to ACTIVE
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "ACTIVE" },
      });

      // Set match to ACTIVE (already started)
      await prisma.match.update({
        where: { id: testMatch.id },
        data: { status: "ACTIVE" },
      });

      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain(
        "Cannot start match in ACTIVE status"
      );
      expect(response.body.currentStatus).toBe("ACTIVE");
      expect(response.body.matchId).toBe(testMatch.id);
    });
  });

  describe("Frontend Integration Validation", () => {
    it("should return the exact data structure expected by frontend", async () => {
      // Reset for clean test
      await prisma.match.update({
        where: { id: testMatch.id },
        data: { status: "PENDING" },
      });
      await prisma.gameSession.deleteMany({
        where: { matchId: testMatch.id },
      });

      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      // This is the exact structure the frontend should expect
      const expectedStructure = {
        success: true,
        message: "Tournament match started successfully",
        data: {
          matchId: expect.any(String),
          gameSessionId: expect.any(String),
          playerColor: expect.stringMatching(/^(white|black)$/),
          tournamentId: expect.any(String),
          gameName: expect.any(String),
        },
      };

      expect(response.body).toMatchObject(expectedStructure);

      // Validate specific values
      expect(response.body.data.matchId).toBe(testMatch.id);
      expect(response.body.data.tournamentId).toBe(testTournament.id);
      expect(response.body.data.gameName).toBe(testGame.name);

      // Validate session ID is valid
      const session = await prisma.gameSession.findUnique({
        where: { id: response.body.data.gameSessionId },
      });
      expect(session).toBeDefined();
      expect(session?.userId).toBe(testUser.id);
    });
  });
});
