import { Chess } from "chess.js";

export class ChessAI {
  private difficulty: "easy" | "medium" | "hard";

  constructor(difficulty: "easy" | "medium" | "hard" = "easy") {
    this.difficulty = difficulty;
  }

  /**
   * Calculate the best move for the AI
   */
  calculateMove(fen: string): any | null {
    try {
      const game = new Chess(fen);
      const moves = game.moves({ verbose: true });

      if (moves.length === 0) {
        return null; // No legal moves
      }

      switch (this.difficulty) {
        case "easy":
          return this.getRandomMove(moves);
        case "medium":
          return this.getMediumMove(game, moves);
        case "hard":
          return this.getHardMove(game, moves);
        default:
          return this.getRandomMove(moves);
      }
    } catch (error) {
      console.error("ChessAI: Error calculating move:", error);
      return null;
    }
  }

  /**
   * Easy AI: Random moves
   */
  private getRandomMove(moves: any[]) {
    const randomIndex = Math.floor(Math.random() * moves.length);
    return moves[randomIndex];
  }

  /**
   * Medium AI: Prefer captures and avoid obvious blunders
   */
  private getMediumMove(game: Chess, moves: any[]) {
    // Prioritize captures
    const captures = moves.filter((move) => move.captured);
    if (captures.length > 0 && Math.random() < 0.7) {
      return captures[Math.floor(Math.random() * captures.length)];
    }

    // Prioritize checks
    const checks = moves.filter((move) => {
      const testGame = new Chess(game.fen());
      testGame.move(move);
      return testGame.isCheck();
    });
    if (checks.length > 0 && Math.random() < 0.5) {
      return checks[Math.floor(Math.random() * checks.length)];
    }

    // Random move otherwise
    return this.getRandomMove(moves);
  }

  /**
   * Hard AI: Basic minimax with piece values
   */
  private getHardMove(game: Chess, moves: any[]) {
    const pieceValues = {
      p: 1,
      n: 3,
      b: 3,
      r: 5,
      q: 9,
      k: 0,
    };

    let bestMove = null;
    let bestValue = -Infinity;

    for (const move of moves) {
      const testGame = new Chess(game.fen());
      testGame.move(move);

      let value = 0;

      // Favor captures
      if (move.captured) {
        value += pieceValues[move.captured.toLowerCase()] * 10;
      }

      // Favor checks
      if (testGame.isCheck()) {
        value += 5;
      }

      // Favor checkmate
      if (testGame.isCheckmate()) {
        value += 1000;
      }

      // Penalize moves that expose king to check
      if (testGame.isCheck() && testGame.turn() === game.turn()) {
        value -= 50;
      }

      // Add some randomness to avoid predictable play
      value += Math.random() * 2;

      if (value > bestValue) {
        bestValue = value;
        bestMove = move;
      }
    }

    return bestMove || this.getRandomMove(moves);
  }

  /**
   * Get the delay before AI makes a move (in milliseconds)
   */
  getMoveDelay(): number {
    switch (this.difficulty) {
      case "easy":
        return 1000 + Math.random() * 2000; // 1-3 seconds
      case "medium":
        return 2000 + Math.random() * 3000; // 2-5 seconds
      case "hard":
        return 3000 + Math.random() * 4000; // 3-7 seconds
      default:
        return 2000;
    }
  }
}

export default ChessAI;
