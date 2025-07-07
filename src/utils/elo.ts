/**
 * ELO Rating System Implementation
 * Based on standard chess ELO calculations
 */

export interface EloResult {
  player1NewRating: number;
  player2NewRating: number;
  player1Change: number;
  player2Change: number;
}

export interface GameResult {
  player1Score: number; // 1 for win, 0.5 for draw, 0 for loss
  player2Score: number; // 1 for win, 0.5 for draw, 0 for loss
}

/**
 * Calculate K-factor based on player rating and games played
 * @param rating Current player rating
 * @param gamesPlayed Number of games played by the player
 * @returns K-factor for ELO calculation
 */
export function calculateKFactor(rating: number, gamesPlayed: number): number {
  // New players (under 30 games) get higher K-factor for faster adjustment
  if (gamesPlayed < 30) {
    return 40;
  }

  // Players under 2100 rating
  if (rating < 2100) {
    return 32;
  }

  // Expert players (2100-2400)
  if (rating < 2400) {
    return 24;
  }

  // Master level players (2400+)
  return 16;
}

/**
 * Calculate expected score for a player against an opponent
 * @param playerRating Player's current rating
 * @param opponentRating Opponent's current rating
 * @returns Expected score (0-1)
 */
export function calculateExpectedScore(
  playerRating: number,
  opponentRating: number
): number {
  const ratingDifference = opponentRating - playerRating;
  return 1 / (1 + Math.pow(10, ratingDifference / 400));
}

/**
 * Calculate new ELO ratings after a game
 * @param player1Rating Player 1's current rating
 * @param player2Rating Player 2's current rating
 * @param player1GamesPlayed Player 1's games played count
 * @param player2GamesPlayed Player 2's games played count
 * @param gameResult Game result scores
 * @returns New ratings and changes for both players
 */
export function calculateEloRatings(
  player1Rating: number,
  player2Rating: number,
  player1GamesPlayed: number,
  player2GamesPlayed: number,
  gameResult: GameResult
): EloResult {
  // Calculate K-factors
  const player1KFactor = calculateKFactor(player1Rating, player1GamesPlayed);
  const player2KFactor = calculateKFactor(player2Rating, player2GamesPlayed);

  // Calculate expected scores
  const player1Expected = calculateExpectedScore(player1Rating, player2Rating);
  const player2Expected = calculateExpectedScore(player2Rating, player1Rating);

  // Calculate rating changes
  const player1Change = Math.round(
    player1KFactor * (gameResult.player1Score - player1Expected)
  );
  const player2Change = Math.round(
    player2KFactor * (gameResult.player2Score - player2Expected)
  );

  // Calculate new ratings
  const player1NewRating = Math.max(100, player1Rating + player1Change); // Minimum rating of 100
  const player2NewRating = Math.max(100, player2Rating + player2Change);

  return {
    player1NewRating,
    player2NewRating,
    player1Change,
    player2Change,
  };
}

/**
 * Convert match result to game scores for ELO calculation
 * @param result Match result string
 * @returns Game result scores
 */
export function matchResultToGameScores(result: string): GameResult {
  switch (result) {
    case "PLAYER1_WIN":
      return { player1Score: 1, player2Score: 0 };
    case "PLAYER2_WIN":
      return { player1Score: 0, player2Score: 1 };
    case "DRAW":
      return { player1Score: 0.5, player2Score: 0.5 };
    default:
      // Default to draw for unknown results
      return { player1Score: 0.5, player2Score: 0.5 };
  }
}
