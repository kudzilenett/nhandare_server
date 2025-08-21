import request from "supertest";
import { app } from "../src/index";
import { prisma } from "../src/config/database";
import jwt from "jsonwebtoken";

describe("Tournament API Endpoints", () => {
  let authToken: string;
  let testUser: any;
  let testTournament: any;

  beforeAll(async () => {
    // Create test user and generate auth token
    testUser = await global.testUtils.createTestUser({
      username: "apitestuser",
      email: "apitest@nhandare.co.zw",
    });

    authToken = jwt.sign(
      { userId: testUser.id, username: testUser.username },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn: "1h" }
    );
  });

  beforeEach(async () => {
    await global.testUtils.cleanDatabase();

    // Recreate test user and tournament for each test
    testUser = await global.testUtils.createTestUser({
      username: "apitestuser",
      email: "apitest@nhandare.co.zw",
    });

    testTournament = await global.testUtils.createTestTournament({
      status: "OPEN",
      maxPlayers: 8,
      currentPlayers: 0,
    });

    authToken = jwt.sign(
      { userId: testUser.id, username: testUser.username },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn: "1h" }
    );
  });

  afterEach(async () => {
    await global.testUtils.cleanDatabase();
  });

  describe("GET /api/tournaments", () => {
    test("Should return list of tournaments", async () => {
      // Create multiple tournaments
      await global.testUtils.createTestTournament({ name: "Tournament 1" });
      await global.testUtils.createTestTournament({ name: "Tournament 2" });
      await global.testUtils.createTestTournament({ name: "Tournament 3" });

      const response = await request(app).get("/api/tournaments").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    });

    test("Should filter tournaments by status", async () => {
      await global.testUtils.createTestTournament({ status: "OPEN" });
      await global.testUtils.createTestTournament({ status: "CLOSED" });
      await global.testUtils.createTestTournament({ status: "ACTIVE" });

      const response = await request(app)
        .get("/api/tournaments?status=OPEN")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((t: any) => t.status === "OPEN")).toBe(
        true
      );
    });

    test("Should filter tournaments by game", async () => {
      await global.testUtils.createTestTournament({ gameId: "chess" });
      await global.testTournament.createTestTournament({ gameId: "checkers" });

      const response = await request(app)
        .get("/api/tournaments?gameId=chess")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((t: any) => t.gameId === "chess")).toBe(
        true
      );
    });

    test("Should paginate results", async () => {
      // Create 15 tournaments
      for (let i = 0; i < 15; i++) {
        await global.testUtils.createTestTournament({
          name: `Tournament ${i + 1}`,
        });
      }

      const response = await request(app)
        .get("/api/tournaments?page=1&limit=10")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(10);
      expect(response.body.pagination).toBeDefined();
    });
  });

  describe("GET /api/tournaments/:id", () => {
    test("Should return tournament details", async () => {
      const response = await request(app)
        .get(`/api/tournaments/${testTournament.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testTournament.id);
      expect(response.body.data.name).toBe(testTournament.name);
    });

    test("Should return 404 for non-existent tournament", async () => {
      const response = await request(app)
        .get("/api/tournaments/non-existent-id")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("not found");
    });

    test("Should include bracket information for active tournaments", async () => {
      // Make tournament active and generate bracket
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "ACTIVE", currentPlayers: 8 },
      });

      // Add players and generate bracket
      for (let i = 0; i < 8; i++) {
        const user = await global.testUtils.createTestUser();
        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: testTournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          },
        });
      }

      const response = await request(app)
        .get(`/api/tournaments/${testTournament.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.bracket).toBeDefined();
    });
  });

  describe("POST /api/tournaments", () => {
    test("Should create new tournament with valid data", async () => {
      const tournamentData = {
        name: "New Test Tournament",
        description: "A test tournament",
        gameId: "chess",
        entryFee: 25,
        localCurrency: "USD",
        maxPlayers: 16,
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        registrationEnd: new Date(
          Date.now() + 12 * 60 * 60 * 1000
        ).toISOString(),
        bracketType: "SINGLE_ELIMINATION",
        prizePool: 500,
        province: "Harare",
        city: "Harare",
      };

      const response = await request(app)
        .post("/api/tournaments")
        .set("Authorization", `Bearer ${authToken}`)
        .send(tournamentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(tournamentData.name);
      expect(response.body.data.status).toBe("OPEN");
    });

    test("Should validate required fields", async () => {
      const invalidData = {
        name: "", // Empty name
        gameId: "invalid-game", // Invalid game
        maxPlayers: 0, // Invalid player count
      };

      const response = await request(app)
        .post("/api/tournaments")
        .set("Authorization", `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test("Should require authentication", async () => {
      const response = await request(app)
        .post("/api/tournaments")
        .send({ name: "Test Tournament" })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("authentication");
    });
  });

  describe("POST /api/tournaments/:id/join", () => {
    test("Should allow joining open tournament", async () => {
      const response = await request(app)
        .post(`/api/tournaments/${testTournament.id}/join`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("joined successfully");

      // Verify player was added
      const player = await prisma.tournamentPlayer.findFirst({
        where: { userId: testUser.id, tournamentId: testTournament.id },
      });
      expect(player).toBeDefined();
    });

    test("Should prevent joining closed tournament", async () => {
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "CLOSED" },
      });

      const response = await request(app)
        .post(`/api/tournaments/${testTournament.id}/join`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("not accepting");
    });

    test("Should prevent joining full tournament", async () => {
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { currentPlayers: 8, maxPlayers: 8 },
      });

      const response = await request(app)
        .post(`/api/tournaments/${testTournament.id}/join`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("full");
    });

    test("Should prevent duplicate registration", async () => {
      // Join tournament first time
      await request(app)
        .post(`/api/tournaments/${testTournament.id}/join`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      // Try to join again
      const response = await request(app)
        .post(`/api/tournaments/${testTournament.id}/join`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("already registered");
    });
  });

  describe("POST /api/tournaments/:id/start", () => {
    test("Should start tournament when conditions are met", async () => {
      // Add minimum players
      for (let i = 0; i < 2; i++) {
        const user = await global.testUtils.createTestUser();
        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: testTournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          },
        });
      }

      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: {
          status: "CLOSED",
          currentPlayers: 2,
        },
      });

      const response = await request(app)
        .post(`/api/tournaments/${testTournament.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("started successfully");

      // Verify tournament status changed
      const updatedTournament = await prisma.tournament.findUnique({
        where: { id: testTournament.id },
      });
      expect(updatedTournament?.status).toBe("ACTIVE");
    });

    test("Should require minimum players to start", async () => {
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "CLOSED", currentPlayers: 1 },
      });

      const response = await request(app)
        .post(`/api/tournaments/${testTournament.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Minimum 2 players");
    });

    test("Should only allow starting closed tournaments", async () => {
      const response = await request(app)
        .post(`/api/tournaments/${testTournament.id}/start`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("must be in CLOSED status");
    });
  });

  describe("POST /api/tournaments/:id/bracket/generate", () => {
    test("Should generate bracket for tournament", async () => {
      // Add players
      for (let i = 0; i < 8; i++) {
        const user = await global.testUtils.createTestUser();
        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: testTournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          },
        });
      }

      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { currentPlayers: 8 },
      });

      const response = await request(app)
        .post(`/api/tournaments/${testTournament.id}/bracket/generate`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("generated successfully");
      expect(response.body.data.bracket).toBeDefined();

      // Verify bracket was created
      const updatedTournament = await prisma.tournament.findUnique({
        where: { id: testTournament.id },
        include: { bracket: true },
      });
      expect(updatedTournament?.bracket).toBeDefined();
    });
  });

  describe("GET /api/tournaments/:id/matches", () => {
    test("Should return tournament matches", async () => {
      // Create tournament with matches
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "ACTIVE", currentPlayers: 4 },
      });

      // Add players and generate bracket
      for (let i = 0; i < 4; i++) {
        const user = await global.testUtils.createTestUser();
        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: testTournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          },
        });
      }

      // Generate bracket and matches
      const { BracketGenerationService } = await import(
        "../src/services/BracketGenerationService"
      );
      await BracketGenerationService.generateBracket(testTournament.id);

      const response = await request(app)
        .get(`/api/tournaments/${testTournament.id}/matches`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test("Should filter matches by round", async () => {
      // Similar setup as above
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "ACTIVE", currentPlayers: 4 },
      });

      for (let i = 0; i < 4; i++) {
        const user = await global.testUtils.createTestUser();
        await prisma.tournamentPlayer.create({
          data: {
            userId: user.id,
            tournamentId: testTournament.id,
            registeredAt: new Date(),
            paymentStatus: "COMPLETED",
          },
        });
      }

      const { BracketGenerationService } = await import(
        "../src/services/BracketGenerationService"
      );
      await BracketGenerationService.generateBracket(testTournament.id);

      const response = await request(app)
        .get(`/api/tournaments/${testTournament.id}/matches?round=1`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((m: any) => m.round === 1)).toBe(true);
    });
  });

  describe("PUT /api/tournaments/:id", () => {
    test("Should update tournament with valid data", async () => {
      const updateData = {
        name: "Updated Tournament Name",
        description: "Updated description",
        prizePool: 1000,
      };

      const response = await request(app)
        .put(`/api/tournaments/${testTournament.id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.prizePool).toBe(updateData.prizePool);
    });

    test("Should prevent updating active tournament", async () => {
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "ACTIVE" },
      });

      const response = await request(app)
        .put(`/api/tournaments/${testTournament.id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Updated Name" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("cannot be modified");
    });
  });

  describe("DELETE /api/tournaments/:id", () => {
    test("Should delete tournament when conditions are met", async () => {
      const response = await request(app)
        .delete(`/api/tournaments/${testTournament.id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("deleted successfully");

      // Verify tournament was deleted
      const deletedTournament = await prisma.tournament.findUnique({
        where: { id: testTournament.id },
      });
      expect(deletedTournament).toBeNull();
    });

    test("Should prevent deleting active tournament", async () => {
      await prisma.tournament.update({
        where: { id: testTournament.id },
        data: { status: "ACTIVE" },
      });

      const response = await request(app)
        .delete(`/api/tournaments/${testTournament.id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("cannot be deleted");
    });
  });
});
