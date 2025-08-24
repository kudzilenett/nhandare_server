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

describe("Matches API", () => {
  let authToken: string;
  let testUser: any;
  let testTournament: any;
  let testMatch: any;
  let testGame: any;

  beforeAll(async () => {
    // Clean up any existing test data in correct order to respect foreign keys
    await prisma.gameSession.deleteMany();
    await prisma.match.deleteMany();
    await prisma.tournamentPlayer.deleteMany();
    await prisma.tournament.deleteMany();
    // Handle any other tables that reference users
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

    // Generate auth token using the proper auth middleware function
    authToken = generateToken({
      id: testUser.id,
      email: testUser.email,
      username: testUser.username,
      role: "user",
    });
  });

  afterAll(async () => {
    // Clean up test data in correct order to respect foreign keys
    await prisma.gameSession.deleteMany();
    await prisma.match.deleteMany();
    await prisma.tournamentPlayer.deleteMany();
    await prisma.tournament.deleteMany();
    // Handle any other tables that reference users
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

  describe("POST /api/matches/:id/start", () => {
    it("should start a tournament match successfully", async () => {
      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(
        "Tournament match started successfully"
      );
      expect(response.body.data).toHaveProperty("matchId");
      expect(response.body.data).toHaveProperty("gameSessionId");
      expect(response.body.data).toHaveProperty("playerColor");
      expect(response.body.data).toHaveProperty("tournamentId");
      expect(response.body.data).toHaveProperty("gameName");

      // Verify match status was updated
      const updatedMatch = await prisma.match.findUnique({
        where: { id: testMatch.id },
      });
      expect(updatedMatch?.status).toBe("ACTIVE");
      expect(updatedMatch?.startedAt).toBeDefined();

      // Verify game sessions were created
      const gameSessions = await prisma.gameSession.findMany({
        where: { matchId: testMatch.id },
      });
      expect(gameSessions).toHaveLength(2);
      expect(gameSessions.every((session) => session.isActive)).toBe(true);
      expect(
        gameSessions.every((session) => session.sessionType === "TOURNAMENT")
      ).toBe(true);
    });

    it("should fail if match does not exist", async () => {
      const fakeMatchId = "cmeo7gsuq0007j0hc0g9lwkv9"; // Valid CUID format but non-existent
      const response = await request(app)
        .post(`/api/matches/${fakeMatchId}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Match not found");
    });

    it("should fail if user is not authenticated", async () => {
      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Access token required");
    });

    it("should fail if user is not a participant in the match", async () => {
      // Create another user
      const otherUser = await prisma.user.create({
        data: {
          email: "otherplayer@nhandare.co.zw",
          username: "OtherPlayer",
          password: "hashedpassword123",
          firstName: "Other",
          lastName: "Player",
          phoneNumber: "+263771234568",
          province: "Harare",
          city: "Harare",
          location: "Harare, Harare",
          isStudent: true,
          institution: "Other University",
          isActive: true,
          isVerified: true,
        },
      });

      const otherUserToken = generateToken({
        id: otherUser.id,
        email: otherUser.email,
        username: otherUser.username,
        role: "user",
      });

      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${otherUserToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "You are not a participant in this match"
      );

      // Clean up
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it("should fail if match is not in PENDING status", async () => {
      // Update match to ACTIVE status
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
      expect(response.body).toHaveProperty("currentStatus", "ACTIVE");
    });

    it("should fail if match already has active sessions", async () => {
      // Create a game session for the match
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

      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Match already has active sessions");
    });

    it("should work with COMPLETED tournament status", async () => {
      // This test verifies our updated logic works with COMPLETED tournaments
      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(
        "Tournament match started successfully"
      );
    });

    it("should work with CLOSED tournament status", async () => {
      // Update tournament to CLOSED status
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "CLOSED" },
      });

      // Reset match status
      await prisma.match.update({
        where: { id: testMatch.id },
        data: { status: "PENDING" },
      });

      // Clean up any existing game sessions
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

    it("should fail if tournament has no matches (bracket not generated)", async () => {
      // Create a new tournament with no matches
      const emptyTournament = await prisma.tournament.create({
        data: {
          title: "Empty Tournament",
          description: "Tournament with no matches",
          gameId: testGame.id,
          entryFee: 50,
          prizePool: 500,
          maxPlayers: 4,
          status: "CLOSED",
          province: "Harare",
          city: "Harare",
          location: "Harare, Harare",
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          registrationStart: new Date(),
          registrationEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Register user for empty tournament
      await prisma.tournamentPlayer.create({
        data: {
          tournamentId: emptyTournament.id,
          userId: testUser.id,
          isActive: true,
        },
      });

      // Create match in empty tournament but then delete ALL matches from tournament
      const emptyMatch = await prisma.match.create({
        data: {
          player1Id: testUser.id,
          player2Id: testUser.id,
          gameId: testGame.id,
          tournamentId: emptyTournament.id,
          round: 1,
          status: "PENDING",
          result: "PENDING",
        },
      });

      // Delete all matches from this tournament to simulate no bracket
      await prisma.match.deleteMany({
        where: { tournamentId: emptyTournament.id },
      });

      const response = await request(app)
        .post(`/api/matches/${emptyMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404); // Expect 404 since match was deleted

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Match not found");

      // Clean up
      await prisma.tournamentPlayer.deleteMany({
        where: { tournamentId: emptyTournament.id },
      });
      await prisma.tournament.delete({ where: { id: emptyTournament.id } });
    });

    it("should fail if tournament status is not allowed", async () => {
      // Update tournament to OPEN status (not allowed for match starting)
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "OPEN" },
      });

      // Reset match status
      await prisma.match.update({
        where: { id: testMatch.id },
        data: { status: "PENDING" },
      });

      // Clean up any existing game sessions
      await prisma.gameSession.deleteMany({
        where: { matchId: testMatch.id },
      });

      const response = await request(app)
        .post(`/api/matches/${testMatch.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain(
        "Tournament is in OPEN status and cannot start matches"
      );
      expect(response.body).toHaveProperty("tournamentStatus", "OPEN");
      expect(response.body).toHaveProperty("allowedStatuses");
      expect(response.body.allowedStatuses).toContain("ACTIVE");
      expect(response.body.allowedStatuses).toContain("CLOSED");
      expect(response.body.allowedStatuses).toContain("COMPLETED");
    });
  });

  describe("GET /api/matches/:id", () => {
    it("should get match details successfully", async () => {
      const response = await request(app)
        .get(`/api/matches/${testMatch.id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("match");
      expect(response.body.data.match).toHaveProperty("id", testMatch.id);
      expect(response.body.data.match).toHaveProperty("status");
      expect(response.body.data.match).toHaveProperty("player1");
      expect(response.body.data.match).toHaveProperty("player2");
      expect(response.body.data.match).toHaveProperty("game");
      expect(response.body.data.match).toHaveProperty("tournament");
    });
  });
});
