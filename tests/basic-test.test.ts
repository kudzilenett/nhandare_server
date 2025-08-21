import { describe, test, expect } from "@jest/globals";

describe("Basic Test Suite", () => {
  test("Should pass basic arithmetic", () => {
    expect(2 + 2).toBe(4);
    expect(10 - 5).toBe(5);
    expect(3 * 4).toBe(12);
    expect(15 / 3).toBe(5);
  });

  test("Should handle string operations", () => {
    const message = "Hello Nhandare";
    expect(message).toContain("Nhandare");
    expect(message.length).toBe(14);
    expect(message.toUpperCase()).toBe("HELLO NHANDARE");
  });

  test("Should work with arrays", () => {
    const games = ["chess", "checkers", "connect4", "tictactoe"];
    expect(games).toHaveLength(4);
    expect(games).toContain("chess");
    expect(games[0]).toBe("chess");
    expect(games[games.length - 1]).toBe("tictactoe");
  });

  test("Should handle async operations", async () => {
    const result = await Promise.resolve("Tournament ready!");
    expect(result).toBe("Tournament ready!");
  });

  test("Should validate Jest globals are working", () => {
    // This test verifies that Jest globals are properly imported
    expect(describe).toBeDefined();
    expect(test).toBeDefined();
    expect(expect).toBeDefined();
  });
});
