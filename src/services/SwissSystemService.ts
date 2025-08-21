import { prisma } from "../config/database";
import { Tournament, TournamentPlayer, Match, User } from "@prisma/client";

export interface SwissPlayer {
  id: string;
  userId: string;
  tournamentId: string;
  score: number;
  buchholzScore: number;
  sonnebornBergerScore: number;
  gamesPlayed: number;
  opponents: string[];
  colorBalance: number; // positive = more white, negative = more black
  lastOpponent?: string;
  username: string;
}

export interface SwissPairing {
  player1Id: string;
  player2Id: string;
  player1Score: number;
  player2Score: number;
  scoreDifference: number;
  colorPreference: "white" | "black" | "neutral";
  isBye: boolean;
}

export interface SwissRound {
  roundNumber: number;
  pairings: SwissPairing[];
  byes: string[];
  unpairedPlayers: string[];
}

export class SwissSystemService {
  /**
   * Swiss system: Pair players with similar scores
   * No elimination - everyone plays fixed number of rounds
   * Ideal for large tournaments (64+ players)
   */

  /**
   * Generate Swiss system round with optimal pairings
   */
  static async generateSwissRound(
    tournamentId: string,
    roundNumber: number
  ): Promise<SwissRound> {
    // Get all players with their current scores and statistics
    const players = await this.getPlayersWithScores(tournamentId);

    if (players.length < 2) {
      throw new Error("Need at least 2 players for Swiss system");
    }

    // Sort players by score, then by tiebreakers
    const sortedPlayers = this.sortPlayersByScore(players);

    // Generate optimal pairings
    const pairings = this.generateOptimalPairings(sortedPlayers, roundNumber);

    // Create matches for this round
    await this.createSwissMatches(tournamentId, roundNumber, pairings);

    return {
      roundNumber,
      pairings,
      byes: this.getByePlayers(sortedPlayers, pairings),
      unpairedPlayers: this.getUnpairedPlayers(sortedPlayers, pairings),
    };
  }

  /**
   * Get players with their current scores and statistics
   */
  private static async getPlayersWithScores(
    tournamentId: string
  ): Promise<SwissPlayer[]> {
    const tournamentPlayers = await prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      include: {
        user: true,
        tournament: true,
      },
    });

    const players: SwissPlayer[] = [];

    for (const player of tournamentPlayers) {
      // Calculate current score
      const score = await this.calculatePlayerScore(
        tournamentId,
        player.userId
      );

      // Calculate tiebreakers
      const buchholzScore = await this.calculateBuchholzScore(
        tournamentId,
        player.userId
      );
      const sonnebornBergerScore = await this.calculateSonnebornBergerScore(
        tournamentId,
        player.userId
      );

      // Get opponents list
      const opponents = await this.getPlayerOpponents(
        tournamentId,
        player.userId
      );

      // Calculate color balance
      const colorBalance = await this.calculateColorBalance(
        tournamentId,
        player.userId
      );

      players.push({
        id: player.id,
        userId: player.userId,
        tournamentId: player.tournamentId,
        score,
        buchholzScore,
        sonnebornBergerScore,
        gamesPlayed: opponents.length,
        opponents,
        colorBalance,
        lastOpponent: opponents[opponents.length - 1],
        username: player.user.username,
      });
    }

    return players;
  }

  /**
   * Calculate player's current score in the tournament
   */
  private static async calculatePlayerScore(
    tournamentId: string,
    userId: string
  ): Promise<number> {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: "COMPLETED",
      },
    });

    let score = 0;
    for (const match of matches) {
      if (match.winnerId === userId) {
        score += 1; // Win
      } else if (match.result === "DRAW") {
        score += 0.5; // Draw
      }
      // Loss = 0 points
    }

    return score;
  }

  /**
   * Calculate Buchholz score (sum of opponents' scores)
   */
  private static async calculateBuchholzScore(
    tournamentId: string,
    userId: string
  ): Promise<number> {
    const opponents = await this.getPlayerOpponents(tournamentId, userId);

    let buchholzScore = 0;
    for (const opponentId of opponents) {
      const opponentScore = await this.calculatePlayerScore(
        tournamentId,
        opponentId
      );
      buchholzScore += opponentScore;
    }

    return buchholzScore;
  }

  /**
   * Calculate Sonneborn-Berger score (sum of scores from games won)
   */
  private static async calculateSonnebornBergerScore(
    tournamentId: string,
    userId: string
  ): Promise<number> {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        player1Id: userId,
        status: "COMPLETED",
        winnerId: userId,
      },
    });

    let sonnebornBergerScore = 0;
    for (const match of matches) {
      const opponentScore = await this.calculatePlayerScore(
        tournamentId,
        match.player2Id
      );
      sonnebornBergerScore += opponentScore;
    }

    // Add games where player was player2
    const player2Matches = await prisma.match.findMany({
      where: {
        tournamentId,
        player2Id: userId,
        status: "COMPLETED",
        winnerId: userId,
      },
    });

    for (const match of player2Matches) {
      const opponentScore = await this.calculatePlayerScore(
        tournamentId,
        match.player1Id
      );
      sonnebornBergerScore += opponentScore;
    }

    return sonnebornBergerScore;
  }

  /**
   * Get list of opponents a player has faced
   */
  private static async getPlayerOpponents(
    tournamentId: string,
    userId: string
  ): Promise<string[]> {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: "COMPLETED",
      },
    });

    return matches.map((match) =>
      match.player1Id === userId ? match.player2Id : match.player1Id
    );
  }

  /**
   * Calculate color balance (positive = more white, negative = more black)
   */
  private static async calculateColorBalance(
    tournamentId: string,
    userId: string
  ): Promise<number> {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: "COMPLETED",
      },
    });

    let colorBalance = 0;
    for (const match of matches) {
      if (match.player1Id === userId) {
        colorBalance += 1; // White
      } else {
        colorBalance -= 1; // Black
      }
    }

    return colorBalance;
  }

  /**
   * Sort players by score, then by tiebreakers
   */
  private static sortPlayersByScore(players: SwissPlayer[]): SwissPlayer[] {
    return players.sort((a, b) => {
      // Primary: Score (highest first)
      if (a.score !== b.score) {
        return b.score - a.score;
      }

      // Secondary: Buchholz score (highest first)
      if (a.buchholzScore !== b.buchholzScore) {
        return b.buchholzScore - a.buchholzScore;
      }

      // Tertiary: Sonneborn-Berger score (highest first)
      if (a.sonnebornBergerScore !== b.sonnebornBergerScore) {
        return b.sonnebornBergerScore - a.sonnebornBergerScore;
      }

      // Quaternary: Games played (fewest first - for players with byes)
      if (a.gamesPlayed !== b.gamesPlayed) {
        return a.gamesPlayed - b.gamesPlayed;
      }

      // Quinary: Random (for complete ties)
      return Math.random() - 0.5;
    });
  }

  /**
   * Generate optimal pairings for Swiss system
   */
  private static generateOptimalPairings(
    players: SwissPlayer[],
    roundNumber: number
  ): SwissPairing[] {
    const pairings: SwissPairing[] = [];
    const usedPlayers = new Set<string>();

    // Group players by score
    const scoreGroups = this.groupPlayersByScore(players);

    // Try to pair within score groups first
    for (const [score, scoreGroup] of scoreGroups) {
      const availablePlayers = scoreGroup.filter(
        (p) => !usedPlayers.has(p.userId)
      );

      if (availablePlayers.length < 2) continue;

      // Try to pair players in this score group
      const scoreGroupPairings = this.pairScoreGroup(
        availablePlayers,
        usedPlayers
      );
      pairings.push(...scoreGroupPairings);
    }

    // Handle remaining unpaired players
    const unpairedPlayers = players.filter((p) => !usedPlayers.has(p.userId));
    if (unpairedPlayers.length >= 2) {
      const remainingPairings = this.pairRemainingPlayers(
        unpairedPlayers,
        usedPlayers
      );
      pairings.push(...remainingPairings);
    }

    return pairings;
  }

  /**
   * Group players by score
   */
  private static groupPlayersByScore(
    players: SwissPlayer[]
  ): Map<number, SwissPlayer[]> {
    const groups = new Map<number, SwissPlayer[]>();

    for (const player of players) {
      const score = player.score;
      if (!groups.has(score)) {
        groups.set(score, []);
      }
      groups.get(score)!.push(player);
    }

    return groups;
  }

  /**
   * Pair players within a score group
   */
  private static pairScoreGroup(
    players: SwissPlayer[],
    usedPlayers: Set<string>
  ): SwissPairing[] {
    const pairings: SwissPairing[] = [];

    // Sort by color balance preference
    const sortedPlayers = [...players].sort((a, b) => {
      // Prefer players with opposite color balance
      if (Math.abs(a.colorBalance) !== Math.abs(b.colorBalance)) {
        return Math.abs(a.colorBalance) - Math.abs(b.colorBalance);
      }
      return a.colorBalance - b.colorBalance;
    });

    for (let i = 0; i < sortedPlayers.length - 1; i += 2) {
      const player1 = sortedPlayers[i];
      const player2 = sortedPlayers[i + 1];

      // Check if they've already played
      if (player1.opponents.includes(player2.userId)) {
        continue; // Skip if they've already met
      }

      // Determine color preference
      const colorPreference = this.determineColorPreference(player1, player2);

      const pairing: SwissPairing = {
        player1Id: player1.userId,
        player2Id: player2.userId,
        player1Score: player1.score,
        player2Score: player2.score,
        scoreDifference: Math.abs(player1.score - player2.score),
        colorPreference,
        isBye: false,
      };

      pairings.push(pairing);
      usedPlayers.add(player1.userId);
      usedPlayers.add(player2.userId);
    }

    return pairings;
  }

  /**
   * Pair remaining unpaired players
   */
  private static pairRemainingPlayers(
    players: SwissPlayer[],
    usedPlayers: Set<string>
  ): SwissPairing[] {
    const pairings: SwissPairing[] = [];

    for (let i = 0; i < players.length - 1; i += 2) {
      const player1 = players[i];
      const player2 = players[i + 1];

      // Check if they've already played
      if (player1.opponents.includes(player2.userId)) {
        continue; // Skip if they've already met
      }

      const colorPreference = this.determineColorPreference(player1, player2);

      const pairing: SwissPairing = {
        player1Id: player1.userId,
        player2Id: player2.userId,
        player1Score: player1.score,
        player2Score: player2.score,
        scoreDifference: Math.abs(player1.score - player2.score),
        colorPreference,
        isBye: false,
      };

      pairings.push(pairing);
      usedPlayers.add(player1.userId);
      usedPlayers.add(player2.userId);
    }

    return pairings;
  }

  /**
   * Determine optimal color preference for pairing
   */
  private static determineColorPreference(
    player1: SwissPlayer,
    player2: SwissPlayer
  ): "white" | "black" | "neutral" {
    // If both players have strong color preferences, try to balance
    if (player1.colorBalance > 1 && player2.colorBalance < -1) {
      return "white"; // player1 gets white, player2 gets black
    }

    if (player1.colorBalance < -1 && player2.colorBalance > 1) {
      return "black"; // player1 gets black, player2 gets white
    }

    // If one player has a strong preference, accommodate them
    if (player1.colorBalance > 1) {
      return "black"; // player1 gets black to balance
    }

    if (player1.colorBalance < -1) {
      return "white"; // player1 gets white to balance
    }

    if (player2.colorBalance > 1) {
      return "white"; // player2 gets white to balance
    }

    if (player2.colorBalance < -1) {
      return "black"; // player2 gets black to balance
    }

    return "neutral"; // No strong preference
  }

  /**
   * Get players who need byes
   */
  private static getByePlayers(
    players: SwissPlayer[],
    pairings: SwissPairing[]
  ): string[] {
    const pairedPlayers = new Set<string>();

    for (const pairing of pairings) {
      pairedPlayers.add(pairing.player1Id);
      pairedPlayers.add(pairing.player2Id);
    }

    return players
      .filter((p) => !pairedPlayers.has(p.userId))
      .map((p) => p.userId);
  }

  /**
   * Get unpaired players
   */
  private static getUnpairedPlayers(
    players: SwissPlayer[],
    pairings: SwissPairing[]
  ): string[] {
    const pairedPlayers = new Set<string>();

    for (const pairing of pairings) {
      pairedPlayers.add(pairing.player1Id);
      pairedPlayers.add(pairing.player2Id);
    }

    return players
      .filter((p) => !pairedPlayers.has(p.userId))
      .map((p) => p.userId);
  }

  /**
   * Create matches for the Swiss round
   */
  private static async createSwissMatches(
    tournamentId: string,
    roundNumber: number,
    pairings: SwissPairing[]
  ): Promise<void> {
    for (const pairing of pairings) {
      if (pairing.isBye) continue;

      // Get the game ID from the tournament
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { gameId: true },
      });

      if (!tournament) continue;

      // Create the match
      await prisma.match.create({
        data: {
          player1Id: pairing.player1Id,
          player2Id: pairing.player2Id,
          gameId: tournament.gameId,
          tournamentId,
          round: roundNumber,
          status: "PENDING",
          result: "PENDING",
        },
      });
    }
  }

  /**
   * Get current Swiss system standings
   */
  static async getSwissStandings(tournamentId: string): Promise<{
    players: Array<{
      userId: string;
      username: string;
      score: number;
      buchholzScore: number;
      sonnebornBergerScore: number;
      gamesPlayed: number;
      colorBalance: number;
      rank: number;
    }>;
    rounds: number;
    currentRound: number;
  }> {
    const players = await this.getPlayersWithScores(tournamentId);
    const sortedPlayers = this.sortPlayersByScore(players);

    // Get tournament info
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { bracket: true },
    });

    const bracket = tournament?.bracket as any;
    const rounds = bracket?.totalRounds || 0;
    const currentRound = Math.max(...players.map((p) => p.gamesPlayed), 0);

    const standings = sortedPlayers.map((player, index) => ({
      userId: player.userId,
      username: player.username || "Unknown",
      score: player.score,
      buchholzScore: player.buchholzScore,
      sonnebornBergerScore: player.sonnebornBergerScore,
      gamesPlayed: player.gamesPlayed,
      colorBalance: player.colorBalance,
      rank: index + 1,
    }));

    return {
      players: standings,
      rounds,
      currentRound,
    };
  }
}
