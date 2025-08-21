import { PrismaClient, BracketType } from "@prisma/client";
import logger from "../config/logger";

const prisma = new PrismaClient();

export interface SeededPlayer {
  userId: string;
  seedNumber: number;
  rating: number;
  registeredAt: Date;
}

export interface BracketMatch {
  player1Seed: number | "TBD";
  player2Seed: number | "TBD";
  player1Id: string | null;
  player2Id: string | null;
  matchNumber: number;
  round: number;
  isBye: boolean;
}

export interface BracketRound {
  roundNumber: number;
  matches: BracketMatch[];
}

export interface BracketStructure {
  type: BracketType;
  rounds: BracketRound[];
  totalRounds: number;
  totalMatches: number;
  players: SeededPlayer[];
  generatedAt: Date;
}

export class BracketGenerationService {
  /**
   * Generate tournament bracket based on type and players
   */
  static async generateBracket(
    tournamentId: string
  ): Promise<BracketStructure> {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          game: true,
          players: {
            include: {
              user: {
                include: {
                  gameStats: true,
                },
              },
            },
            orderBy: { registeredAt: "asc" },
          },
        },
      });

      if (!tournament) {
        throw new Error("Tournament not found");
      }

      if (tournament.players.length < 2) {
        throw new Error("Minimum 2 players required to generate bracket");
      }

      logger.info(
        `Generating bracket for tournament ${tournamentId} with ${tournament.players.length} players`
      );

      // Seed players based on rating or registration order
      const seededPlayers = this.seedPlayers(tournament.players);

      // Generate bracket based on type
      let bracket: BracketStructure;
      switch (tournament.bracketType) {
        case "SINGLE_ELIMINATION":
          bracket = this.generateSingleElimination(seededPlayers);
          break;
        case "DOUBLE_ELIMINATION":
          bracket = this.generateDoubleElimination(seededPlayers);
          break;
        case "SWISS":
          bracket = this.generateSwissSystem(seededPlayers);
          break;
        case "ROUND_ROBIN":
          bracket = this.generateRoundRobin(seededPlayers);
          break;
        default:
          bracket = this.generateSingleElimination(seededPlayers);
      }

      // Save bracket to tournament
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { bracket: bracket as any },
      });

      // Create first round matches
      await this.createFirstRoundMatches(tournamentId, bracket);

      logger.info(`Bracket generated for tournament ${tournamentId}`, {
        type: bracket.type,
        players: bracket.players.length,
        rounds: bracket.totalRounds,
        matches: bracket.totalMatches,
      });

      return bracket;
    } catch (error) {
      logger.error(
        `Failed to generate bracket for tournament ${tournamentId}`,
        { error }
      );
      throw error;
    }
  }

  /**
   * Seed players based on rating or registration order
   */
  private static seedPlayers(players: any[]): SeededPlayer[] {
    return players
      .map((player, index) => ({
        userId: player.userId,
        seedNumber: index + 1,
        rating: player.user.gameStats[0]?.rating || 1200,
        registeredAt: player.registeredAt,
      }))
      .sort((a, b) => b.rating - a.rating) // Highest rated first
      .map((player, index) => ({
        ...player,
        seedNumber: index + 1,
      }));
  }

  /**
   * Generate single elimination bracket
   * Industry standard: 1 vs lowest, 2 vs second-lowest, etc.
   */
  private static generateSingleElimination(
    players: SeededPlayer[]
  ): BracketStructure {
    const totalPlayers = players.length;
    const rounds = Math.ceil(Math.log2(totalPlayers));
    const totalMatches = Math.pow(2, rounds) - 1;

    const bracket: BracketStructure = {
      type: "SINGLE_ELIMINATION",
      rounds: [],
      totalRounds: rounds,
      totalMatches,
      players,
      generatedAt: new Date(),
    };

    // Generate first round matchups with proper seeding
    const firstRoundMatches: BracketMatch[] = [];
    const playerCount = players.length;
    const bracketSize = Math.pow(2, rounds);

    for (let i = 0; i < bracketSize / 2; i++) {
      const player1Index = i;
      const player2Index = bracketSize - 1 - i;

      const match: BracketMatch = {
        player1Seed:
          player1Index < playerCount ? players[player1Index].seedNumber : "TBD",
        player2Seed:
          player2Index < playerCount ? players[player2Index].seedNumber : "TBD",
        player1Id:
          player1Index < playerCount ? players[player1Index].userId : null,
        player2Id:
          player2Index < playerCount ? players[player2Index].userId : null,
        matchNumber: i + 1,
        round: 1,
        isBye: false,
      };

      // Handle bye (odd number of players)
      if (player1Index >= playerCount || player2Index >= playerCount) {
        match.isBye = true;
        if (player1Index < playerCount) {
          match.player2Id = null;
          match.player2Seed = "TBD";
        } else if (player2Index < playerCount) {
          match.player1Id = null;
          match.player1Seed = "TBD";
        }
      }

      firstRoundMatches.push(match);
    }

    bracket.rounds.push({
      roundNumber: 1,
      matches: firstRoundMatches,
    });

    // Generate subsequent rounds (TBD matches)
    for (let round = 2; round <= rounds; round++) {
      const matchesInRound = Math.ceil(bracketSize / Math.pow(2, round));
      const roundMatches: BracketMatch[] = [];

      for (let i = 0; i < matchesInRound; i++) {
        roundMatches.push({
          player1Seed: "TBD",
          player2Seed: "TBD",
          player1Id: null,
          player2Id: null,
          matchNumber: i + 1,
          round,
          isBye: false,
        });
      }

      bracket.rounds.push({
        roundNumber: round,
        matches: roundMatches,
      });
    }

    return bracket;
  }

  /**
   * Generate double elimination bracket
   * Winners bracket + losers bracket
   */
  private static generateDoubleElimination(
    players: SeededPlayer[]
  ): BracketStructure {
    const totalPlayers = players.length;
    const winnersRounds = Math.ceil(Math.log2(totalPlayers));
    const losersRounds = winnersRounds * 2 - 1;

    const bracket: BracketStructure = {
      type: "DOUBLE_ELIMINATION",
      rounds: [],
      totalRounds: winnersRounds + losersRounds,
      totalMatches: 0, // Will be calculated
      players,
      generatedAt: new Date(),
    };

    // Generate winners bracket (similar to single elimination)
    const winnersBracket = this.generateSingleElimination(players);
    bracket.rounds.push(...winnersBracket.rounds);

    // Generate losers bracket
    // Losers bracket is more complex - players drop down after each loss
    // For now, we'll create placeholder rounds
    for (let round = 1; round <= losersRounds; round++) {
      const matchesInRound = Math.ceil(totalPlayers / Math.pow(2, round));
      const roundMatches: BracketMatch[] = [];

      for (let i = 0; i < matchesInRound; i++) {
        roundMatches.push({
          player1Seed: "TBD",
          player2Seed: "TBD",
          player1Id: null,
          player2Id: null,
          matchNumber: i + 1,
          round: winnersRounds + round,
          isBye: false,
        });
      }

      bracket.rounds.push({
        roundNumber: winnersRounds + round,
        matches: roundMatches,
      });
    }

    bracket.totalMatches = bracket.rounds.reduce(
      (sum, round) => sum + round.matches.length,
      0
    );
    return bracket;
  }

  /**
   * Generate Swiss system bracket
   * Players are paired based on similar scores
   */
  private static generateSwissSystem(
    players: SeededPlayer[]
  ): BracketStructure {
    const totalPlayers = players.length;
    const maxRounds = Math.ceil(Math.log2(totalPlayers));
    const rounds = Math.min(maxRounds, 6); // Cap at 6 rounds for Swiss system

    const bracket: BracketStructure = {
      type: "SWISS",
      rounds: [],
      totalRounds: rounds,
      totalMatches: 0,
      players,
      generatedAt: new Date(),
    };

    // Swiss system generates rounds as tournament progresses
    // First round is seeded, subsequent rounds based on scores
    for (let round = 1; round <= rounds; round++) {
      const matchesInRound = Math.ceil(totalPlayers / 2);
      const roundMatches: BracketMatch[] = [];

      for (let i = 0; i < matchesInRound; i++) {
        roundMatches.push({
          player1Seed: "TBD",
          player2Seed: "TBD",
          player1Id: null,
          player2Id: null,
          matchNumber: i + 1,
          round,
          isBye: false,
        });
      }

      bracket.rounds.push({
        roundNumber: round,
        matches: roundMatches,
      });
    }

    bracket.totalMatches = bracket.rounds.reduce(
      (sum, round) => sum + round.matches.length,
      0
    );
    return bracket;
  }

  /**
   * Generate round robin bracket
   * Every player plays every other player
   */
  private static generateRoundRobin(players: SeededPlayer[]): BracketStructure {
    const totalPlayers = players.length;
    const rounds = totalPlayers - 1;
    const matchesPerRound = Math.floor(totalPlayers / 2);

    const bracket: BracketStructure = {
      type: "ROUND_ROBIN",
      rounds: [],
      totalRounds: rounds,
      totalMatches: rounds * matchesPerRound,
      players,
      generatedAt: new Date(),
    };

    // Generate rounds using circle method
    for (let round = 1; round <= rounds; round++) {
      const roundMatches: BracketMatch[] = [];

      for (let i = 0; i < matchesPerRound; i++) {
        const player1Index = i;
        const player2Index = totalPlayers - 1 - i;

        roundMatches.push({
          player1Seed: players[player1Index].seedNumber,
          player2Seed: players[player2Index].seedNumber,
          player1Id: players[player1Index].userId,
          player2Id: players[player2Index].userId,
          matchNumber: i + 1,
          round,
          isBye: false,
        });
      }

      bracket.rounds.push({
        roundNumber: round,
        matches: roundMatches,
      });

      // Rotate players for next round (circle method)
      // This is a simplified rotation - in practice, more complex algorithms exist
    }

    return bracket;
  }

  /**
   * Create first round matches in database
   */
  private static async createFirstRoundMatches(
    tournamentId: string,
    bracket: BracketStructure
  ): Promise<void> {
    try {
      // Get tournament to get gameId
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { gameId: true },
      });

      if (!tournament) {
        throw new Error("Tournament not found");
      }

      if (!tournament.gameId) {
        throw new Error("Tournament has no associated game");
      }

      const firstRound = bracket.rounds[0];
      const matches = [];

      for (const match of firstRound.matches) {
        if (match.player1Id && match.player2Id && !match.isBye) {
          matches.push({
            player1Id: match.player1Id,
            player2Id: match.player2Id,
            gameId: tournament.gameId, // Add required gameId field
            tournamentId,
            round: 1,
            status: "PENDING",
            result: "PENDING",
          });
        }
      }

      if (matches.length > 0) {
        logger.info(
          `Creating ${matches.length} matches for tournament ${tournamentId}`
        );

        await prisma.match.createMany({
          data: matches,
        });

        logger.info(
          `Created ${matches.length} first round matches for tournament ${tournamentId}`
        );
      } else {
        logger.warn(
          `No valid matches to create for tournament ${tournamentId}`
        );
      }
    } catch (error) {
      logger.error(
        `Failed to create first round matches for tournament ${tournamentId}`,
        { error }
      );
      throw error;
    }
  }

  /**
   * Get bracket for a tournament
   */
  static async getBracket(
    tournamentId: string
  ): Promise<BracketStructure | null> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { bracket: true },
    });

    return (tournament?.bracket as unknown as BracketStructure) || null;
  }

  /**
   * Update bracket after match completion
   */
  static async updateBracketAfterMatch(
    tournamentId: string,
    matchId: string
  ): Promise<void> {
    // TODO: Implement bracket update logic
    // This will advance winners to next rounds
    // Update TBD matches with actual player IDs
    logger.info(
      `Bracket update needed for tournament ${tournamentId} after match ${matchId}`
    );
  }
}
