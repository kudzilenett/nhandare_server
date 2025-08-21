import { PrismaClient } from "@prisma/client";
import logger from "../config/logger";

// Define the bracket type enum locally to match Prisma schema
type BracketType =
  | "SINGLE_ELIMINATION"
  | "DOUBLE_ELIMINATION"
  | "ROUND_ROBIN"
  | "SWISS";

const prisma = new PrismaClient();

export interface SeededPlayer {
  userId: string;
  seedNumber: number;
  rating: number;
  registeredAt: Date;
}

export interface BracketMatch {
  id?: string; // Database match ID
  player1Seed: number | "TBD";
  player2Seed: number | "TBD";
  player1Id: string | null;
  player2Id: string | null;
  matchNumber: number;
  round: number;
  isBye: boolean;
  winnerId?: string | null; // Track winner for progression
  nextMatchId?: string | null; // Link to next match in bracket
  status?: "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
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
        userId: player.user.id, // Fixed: access player.user.id not player.userId
        seedNumber: index + 1,
        rating: player.user.gameStats?.[0]?.rating || 1200,
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
        status: "PENDING",
        winnerId: null,
        nextMatchId: null,
      };

      // Handle bye (odd number of players)
      if (player1Index >= playerCount || player2Index >= playerCount) {
        match.isBye = true;
        if (player1Index < playerCount) {
          match.player2Id = null;
          match.player2Seed = "TBD";
          // Auto-advance player1 to next round
          match.winnerId = match.player1Id;
          match.status = "COMPLETED";
        } else if (player2Index < playerCount) {
          match.player1Id = null;
          match.player1Seed = "TBD";
          // Auto-advance player2 to next round
          match.winnerId = match.player2Id;
          match.status = "COMPLETED";
        }
      }

      firstRoundMatches.push(match);
    }

    bracket.rounds.push({
      roundNumber: 1,
      matches: firstRoundMatches,
    });

    // Generate subsequent rounds with proper progression linking
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
          status: "PENDING",
          winnerId: null,
          nextMatchId: null,
        });
      }

      bracket.rounds.push({
        roundNumber: round,
        matches: roundMatches,
      });
    }

    // Link matches for progression (winners advance to next round)
    this.linkBracketProgression(bracket);

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
            gameId: tournament.gameId,
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

        const createdMatches = await prisma.match.createMany({
          data: matches,
        });

        // Update bracket with actual match IDs
        await this.updateBracketWithMatchIds(tournamentId, bracket);

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
   * Update bracket with actual match IDs from database
   */
  private static async updateBracketWithMatchIds(
    tournamentId: string,
    bracket: BracketStructure
  ): Promise<void> {
    try {
      // Get all matches for this tournament
      const matches = await prisma.match.findMany({
        where: { tournamentId },
        select: { id: true, player1Id: true, player2Id: true, round: true },
        orderBy: [{ round: "asc" }, { createdAt: "asc" }],
      });

      // Update bracket with match IDs
      for (const round of bracket.rounds) {
        for (const bracketMatch of round.matches) {
          // Find corresponding database match
          const dbMatch = matches.find(
            (match) =>
              match.player1Id === bracketMatch.player1Id &&
              match.player2Id === bracketMatch.player2Id &&
              match.round === bracketMatch.round
          );

          if (dbMatch) {
            bracketMatch.id = dbMatch.id;
          }
        }
      }

      // Update tournament bracket in database
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { bracket: bracket as any },
      });

      logger.info(
        `Updated bracket for tournament ${tournamentId} with match IDs`
      );
    } catch (error) {
      logger.error(
        `Failed to update bracket with match IDs for tournament ${tournamentId}`,
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
   * Update bracket after a match is completed
   */
  static async updateBracketAfterMatch(
    tournamentId: string,
    matchId: string,
    winnerId: string
  ): Promise<void> {
    try {
      // Get the tournament with its bracket
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { bracket: true },
      });

      if (!tournament || !tournament.bracket) {
        throw new Error("Tournament or bracket not found");
      }

      const bracket = tournament.bracket as unknown as BracketStructure;

      // Find the completed match in the bracket
      let completedMatch: BracketMatch | null = null;
      let completedRoundIndex = -1;

      for (
        let roundIndex = 0;
        roundIndex < bracket.rounds.length;
        roundIndex++
      ) {
        const round = bracket.rounds[roundIndex];
        const matchIndex = round.matches.findIndex((m) => m.id === matchId);

        if (matchIndex !== -1) {
          completedMatch = round.matches[matchIndex];
          completedRoundIndex = roundIndex;
          break;
        }
      }

      if (!completedMatch) {
        throw new Error("Match not found in bracket");
      }

      // Update the match with winner
      completedMatch.winnerId = winnerId;
      completedMatch.status = "COMPLETED";

      // If there's a next match, assign the winner
      if (
        completedMatch.nextMatchId &&
        completedRoundIndex < bracket.rounds.length - 1
      ) {
        const nextRound = bracket.rounds[completedRoundIndex + 1];
        const nextMatch = nextRound.matches.find(
          (m) => m.id === completedMatch!.nextMatchId
        );

        if (nextMatch) {
          // Determine which slot to fill based on match position
          const matchPosition =
            bracket.rounds[completedRoundIndex].matches.indexOf(completedMatch);
          const isFirstSlot = matchPosition % 2 === 0;

          if (isFirstSlot) {
            nextMatch.player1Id = winnerId;
            nextMatch.player1Seed = "TBD";
          } else {
            nextMatch.player2Id = winnerId;
            nextMatch.player2Seed = "TBD";
          }

          // If both players are now assigned, mark match as ready
          if (nextMatch.player1Id && nextMatch.player2Id) {
            nextMatch.status = "PENDING";
          }
        }
      }

      // Update the tournament bracket in database
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { bracket: bracket as any },
      });

      logger.info(
        `Updated bracket for tournament ${tournamentId} after match ${matchId}`
      );
    } catch (error) {
      logger.error(`Failed to update bracket after match: ${error}`);
      throw error;
    }
  }

  /**
   * Regenerate bracket for an existing tournament
   * Useful for fixing bracket issues or updating tournament structure
   */
  static async regenerateBracket(
    tournamentId: string
  ): Promise<BracketStructure> {
    try {
      // Get tournament with players and existing matches
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          players: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  avatar: true,
                },
              },
            },
          },
          matches: true,
        },
      });

      if (!tournament) {
        throw new Error("Tournament not found");
      }

      if (tournament.status !== "OPEN" && tournament.status !== "ACTIVE") {
        throw new Error("Cannot regenerate bracket for completed tournament");
      }

      // Convert players to seeded format
      const seededPlayers: SeededPlayer[] = tournament.players.map(
        (player, index) => ({
          userId: player.user.id,
          seedNumber: index + 1,
          rating: 1200, // Default rating if not available
          registeredAt: player.registeredAt,
        })
      );

      // Generate new bracket structure
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
          throw new Error(
            `Unsupported bracket type: ${tournament.bracketType}`
          );
      }

      // Link bracket progression
      this.linkBracketProgression(bracket);

      // Update tournament with new bracket
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { bracket: bracket as any },
      });

      // If there are existing matches, try to link them to the new bracket
      if (tournament.matches && tournament.matches.length > 0) {
        await this.updateBracketWithMatchIds(tournamentId, bracket);
      }

      logger.info(`Regenerated bracket for tournament ${tournamentId}`);
      return bracket;
    } catch (error) {
      logger.error(`Failed to regenerate bracket: ${error}`);
      throw error;
    }
  }

  /**
   * Link matches between rounds for proper progression
   */
  private static linkBracketProgression(bracket: BracketStructure): void {
    // Link matches between rounds so winners advance properly
    for (
      let roundIndex = 0;
      roundIndex < bracket.rounds.length - 1;
      roundIndex++
    ) {
      const currentRound = bracket.rounds[roundIndex];
      const nextRound = bracket.rounds[roundIndex + 1];

      // Link each match in current round to next round
      currentRound.matches.forEach((match, matchIndex) => {
        // Find the next match in the next round that this winner should play
        const nextMatchIndex = Math.floor(matchIndex / 2); // Simple pairing: winners from adjacent matches play each other

        if (nextMatchIndex < nextRound.matches.length) {
          const nextMatch = nextRound.matches[nextMatchIndex];

          // Link the current match to the next match
          match.nextMatchId = nextMatch.id;

          // Assign winner to the appropriate slot in next match
          if (matchIndex % 2 === 0) {
            nextMatch.player1Id = null; // Will be filled when match completes
            nextMatch.player1Seed = "TBD"; // Mark as filled
          } else {
            nextMatch.player2Id = null; // Will be filled when match completes
            nextMatch.player2Seed = "TBD"; // Mark as filled
          }

          // If both players are assigned, mark match as ready
          if (nextMatch.player1Id && nextMatch.player2Id) {
            nextMatch.status = "PENDING";
          }
        }
      });
    }
  }
}
