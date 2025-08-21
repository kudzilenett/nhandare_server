import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { beforeAll, afterAll, jest } from "@jest/globals";

// Load test environment variables
dotenv.config({ path: ".env.test" });

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    "postgresql://test:test@localhost:5432/nhandare_test";

  // Initialize test database connection
  global.prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
});

// Global test teardown
afterAll(async () => {
  await global.prisma?.$disconnect();
});

// Global test utilities
global.testUtils = {
  // Clean database between tests
  async cleanDatabase() {
    const tables = [
      "Match",
      "TournamentPlayer",
      "Tournament",
      "GameSession",
      "User",
      "GameStats",
      "Payment",
    ];

    for (const table of tables) {
      try {
        await global.prisma.$executeRawUnsafe(
          `TRUNCATE TABLE "${table}" CASCADE`
        );
      } catch (error) {
        // Table might not exist, continue
      }
    }
  },

  // Create test user
  async createTestUser(data: any = {}) {
    return await global.prisma.user.create({
      data: {
        username: `testuser_${Date.now()}`,
        email: `test_${Date.now()}@nhandare.co.zw`,
        password: "hashedpassword123",
        phone: "+263771234567",
        province: "Harare",
        city: "Harare",
        ...data,
      },
    });
  },

  // Create test tournament
  async createTestTournament(data: any = {}) {
    return await global.prisma.tournament.create({
      data: {
        title: `Test Tournament ${Date.now()}`,
        description: "Test tournament for automated testing",
        gameId: "chess",
        status: "OPEN",
        entryFee: 25,
        localCurrency: "USD",
        maxPlayers: 8,
        currentPlayers: 0,
        registrationStart: new Date(),
        registrationEnd: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
        bracketType: "SINGLE_ELIMINATION",
        prizePool: 500,
        province: "Harare",
        city: "Harare",
        ...data,
      },
    });
  },

  // Create test match
  async createTestMatch(data: any = {}) {
    const player1 = await this.createTestUser();
    const player2 = await this.createTestUser();
    const tournament = await this.createTestTournament();

    return await global.prisma.match.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        gameId: "chess",
        tournamentId: tournament.id,
        status: "PENDING",
        result: "PENDING",
        round: 1,
        ...data,
      },
    });
  },

  // Simulate time advancement
  async advanceTime(seconds: number) {
    const now = Date.now();
    const future = new Date(now + seconds * 1000);

    // Mock Date.now() for the duration of the test
    const originalNow = Date.now;
    Date.now = jest.fn(() => future.getTime());

    return () => {
      Date.now = originalNow;
    };
  },
};

// Type declarations for global test utilities
declare global {
  var prisma: PrismaClient;
  var testUtils: {
    cleanDatabase(): Promise<void>;
    createTestUser(data?: any): Promise<any>;
    createTestTournament(data?: any): Promise<any>;
    createTestMatch(data?: any): Promise<any>;
    advanceTime(seconds: number): Promise<() => void>;
  };

  namespace NodeJS {
    interface Global {
      prisma: PrismaClient;
      testUtils: typeof global.testUtils;
    }
  }
}
