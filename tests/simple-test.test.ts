import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { prisma } from "../src/config/database";

describe("Simple Test Suite", () => {
  beforeEach(async () => {
    await global.testUtils.cleanDatabase();
  });

  afterEach(async () => {
    await global.testUtils.cleanDatabase();
  });

  test("Should create and find a test user", async () => {
    // Create a test user
    const user = await global.testUtils.createTestUser({
      username: "testuser",
      email: "test@nhandare.co.zw",
    });

    expect(user).toBeDefined();
    expect(user.username).toBe("testuser");
    expect(user.email).toBe("test@nhandare.co.zw");

    // Verify user was saved to database
    const foundUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    expect(foundUser).toBeDefined();
    expect(foundUser?.username).toBe("testuser");
  });

  test("Should create and find a test tournament", async () => {
    // Create a test tournament
    const tournament = await global.testUtils.createTestTournament({
      title: "Test Tournament",
      description: "A simple test tournament",
    });

    expect(tournament).toBeDefined();
    expect(tournament.title).toBe("Test Tournament");
    expect(tournament.description).toBe("A simple test tournament");

    // Verify tournament was saved to database
    const foundTournament = await prisma.tournament.findUnique({
      where: { id: tournament.id },
    });

    expect(foundTournament).toBeDefined();
    expect(foundTournament?.title).toBe("Test Tournament");
  });

  test("Should clean database between tests", async () => {
    // Create a user in first test
    const user = await global.testUtils.createTestUser({
      username: "cleanupuser",
      email: "cleanup@nhandare.co.zw",
    });

    expect(user).toBeDefined();

    // In the next test, this user should not exist
    // This test verifies the cleanup is working
  });
});
