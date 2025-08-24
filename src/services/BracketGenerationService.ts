import { PrismaClient } from "@prisma/client";
import logger from "../config/logger";
import EventBus from "../utils/EventBus";

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
  player1Seed: number | "TBD" | "BYE";
  player2Seed: number | "TBD" | "BYE";
  player1Id: string | null;
  player2Id: string | null;
  player1Info?: any; // Player info for display
  player2Info?: any; // Player info for display
  matchNumber: number;
  round: number;
  isBye: boolean;
  winnerId?: string | null; // Track winner for progression
  nextMatchId?: string | null; // Link to next match in bracket
  status?: "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "WAITING";
  bracketType?: "winners" | "losers" | "grand_finals"; // For double elimination
}

export interface BracketRound {
  round: number;
  matches: BracketMatch[];
  bracketType?: "winners" | "losers" | "grand_finals"; // For double elimination
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
    tournamentId: string,
    useAdvancedSeeding: boolean = false
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

      // Seed players based on rating or registration order, or use advanced seeding
      const seededPlayers = useAdvancedSeeding
        ? await this.generateAdvancedSeeding(tournamentId, tournament.players)
        : this.seedPlayers(tournament.players);

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
      await this.createMatches(tournamentId, bracket);

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
   * Generate advanced seeding using multiple factors
   * This method provides sophisticated seeding based on ratings, performance, history, and regional factors
   */
  private static async generateAdvancedSeeding(
    tournamentId: string,
    players: any[]
  ): Promise<SeededPlayer[]> {
    try {
      // Import dynamically to avoid circular dependencies
      const { AdvancedSeedingService } = await import(
        "./AdvancedSeedingService"
      );

      // Generate advanced seeding data
      const advancedSeedingData =
        await AdvancedSeedingService.generateAdvancedSeeding(tournamentId);

      // Convert to SeededPlayer format
      return advancedSeedingData.map((data, index) => ({
        userId: data.userId,
        seedNumber: data.finalSeed,
        rating: data.baseRating,
        registeredAt: new Date(), // We'll get this from the player data if needed
      }));
    } catch (error) {
      // Fallback to basic seeding if advanced seeding fails
      console.warn(
        "Advanced seeding failed, falling back to basic seeding:",
        error
      );
      return this.seedPlayers(players);
    }
  }

  /**
   * Generate single elimination bracket with proper seeding and bye handling
   */
  private static generateSingleElimination(
    players: SeededPlayer[]
  ): BracketStructure {
    const totalPlayers = players.length;
    const rounds = Math.ceil(Math.log2(totalPlayers));

    const bracket: BracketStructure = {
      type: "SINGLE_ELIMINATION",
      rounds: [],
      totalRounds: rounds,
      totalMatches: totalPlayers - 1, // Single elimination: each match eliminates one player
      players,
      generatedAt: new Date(),
    };

    // Generate rounds from first to final
    for (let round = 1; round <= rounds; round++) {
      const matchesInRound = Math.ceil(totalPlayers / Math.pow(2, round));
      const roundMatches: BracketMatch[] = [];

      for (let i = 0; i < matchesInRound; i++) {
        if (round === 1) {
          // First round: assign actual players
          const player1Index = i * 2;
          const player2Index = i * 2 + 1;

          const player1 = players[player1Index] || null;
          const player2 = players[player2Index] || null;

          // Handle byes in first round
          const isBye = !player1 || !player2;

          roundMatches.push({
            player1Seed: player1?.seedNumber || "BYE",
            player2Seed: player2?.seedNumber || "BYE",
            player1Id: player1?.userId || null,
            player2Id: player2?.userId || null,
            matchNumber: i + 1,
            round: 1,
            isBye,
            status: isBye ? "WAITING" : "PENDING",
            winnerId: isBye ? player1?.userId || player2?.userId || null : null,
            nextMatchId: null,
          });
        } else {
          // Subsequent rounds: TBD players
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
      }

      bracket.rounds.push({
        round,
        matches: roundMatches,
      });
    }

    // Note: Bracket progression linking will be handled when subsequent rounds are created
    // during actual tournament play, not during bracket generation

    return bracket;
  }

  /**
   * Calculate optimal bracket size for tournament
   */
  private static calculateBracketSize(playerCount: number): number {
    // Find the next power of 2 that can accommodate all players
    let bracketSize = 2;
    while (bracketSize < playerCount) {
      bracketSize *= 2;
    }
    return bracketSize;
  }

  /**
   * Calculate fair bye distribution for odd player counts
   */
  private static calculateByeDistribution(
    playerCount: number,
    bracketSize: number
  ): number[] {
    const byesNeeded = bracketSize - playerCount;
    if (byesNeeded === 0) return [];

    // Fair bye distribution: distribute byes across different seed positions
    // Higher seeds get fewer byes, lower seeds get more byes
    const byePositions: number[] = [];

    // Start with lower seeds (higher numbers) for bye distribution
    for (let i = 0; i < byesNeeded; i++) {
      const byePosition = bracketSize - 1 - i;
      byePositions.push(byePosition);
    }

    return byePositions;
  }

  /**
   * Generate first round matches with proper bye handling
   */
  private static generateFirstRoundMatches(
    players: SeededPlayer[],
    bracketSize: number,
    byePositions: number[]
  ): BracketMatch[] {
    const matches: BracketMatch[] = [];
    const playerCount = players.length;

    for (let i = 0; i < bracketSize / 2; i++) {
      const player1Index = i;
      const player2Index = bracketSize - 1 - i;

      const match: BracketMatch = {
        player1Seed: players[player1Index]?.seedNumber || "TBD",
        player2Seed: players[player2Index]?.seedNumber || "TBD",
        player1Id: players[player1Index]?.userId || null,
        player2Id: players[player2Index]?.userId || null,
        matchNumber: i + 1,
        round: 1,
        isBye: false,
        status: "PENDING",
        winnerId: null,
        nextMatchId: null,
      };

      // Check if this match should have a bye
      if (
        byePositions.includes(player1Index) ||
        byePositions.includes(player2Index)
      ) {
        match.isBye = true;

        if (byePositions.includes(player1Index)) {
          // Player1 gets a bye, player2 advances
          match.player1Id = null;
          match.player1Seed = "TBD";
          match.winnerId = match.player2Id;
          match.status = "COMPLETED";
        } else {
          // Player2 gets a bye, player1 advances
          match.player2Id = null;
          match.player2Seed = "TBD";
          match.winnerId = match.player1Id;
          match.status = "COMPLETED";
        }
      }

      matches.push(match);
    }

    return matches;
  }

  /**
   * Generate double elimination bracket
   * Winners bracket + losers bracket with proper progression
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
      totalRounds: winnersRounds + losersRounds + 1, // +1 for grand finals
      totalMatches: 0,
      players,
      generatedAt: new Date(),
    };

    // Generate winners bracket (similar to single elimination)
    const winnersBracket = this.generateSingleElimination(players);

    // Rename rounds to distinguish winners bracket
    winnersBracket.rounds.forEach((round, index) => {
      round.round = index + 1;
      round.bracketType = "winners"; // Set bracket type on round
      round.matches.forEach((match) => {
        match.round = index + 1;
        match.bracketType = "winners";
      });
    });

    bracket.rounds.push(...winnersBracket.rounds);

    // Generate losers bracket with proper structure
    const losersBracket = this.generateLosersBracket(players, winnersRounds);
    bracket.rounds.push(...losersBracket);

    // Generate grand finals round
    const grandFinals = this.generateGrandFinals(
      winnersRounds + losersBracket.length + 1
    );
    bracket.rounds.push(grandFinals);

    // Note: Double elimination progression linking will be handled when subsequent rounds are created
    // during actual tournament play, not during bracket generation

    bracket.totalMatches = bracket.rounds.reduce(
      (sum, round) => sum + round.matches.length,
      0
    );

    return bracket;
  }

  /**
   * Generate losers bracket for double elimination
   */
  private static generateLosersBracket(
    players: SeededPlayer[],
    winnersRounds: number
  ): BracketRound[] {
    const totalPlayers = players.length;
    const losersRounds = winnersRounds * 2 - 1;
    const rounds: BracketRound[] = [];

    // Losers bracket has a specific structure:
    // Round 1: Players who lost in winners bracket round 1
    // Round 2: Winners of losers round 1 + players who lost in winners bracket round 2
    // And so on...

    for (let round = 1; round <= losersRounds; round++) {
      const roundNumber = winnersRounds + round;
      const matchesInRound = this.calculateLosersBracketMatches(
        round,
        totalPlayers
      );
      const roundMatches: BracketMatch[] = [];

      for (let i = 0; i < matchesInRound; i++) {
        roundMatches.push({
          player1Seed: "TBD",
          player2Seed: "TBD",
          player1Id: null,
          player2Id: null,
          matchNumber: i + 1,
          round: roundNumber,
          isBye: false,
          bracketType: "losers",
          status: "PENDING",
          winnerId: null,
          nextMatchId: null,
        });
      }

      rounds.push({
        round: roundNumber,
        matches: roundMatches,
        bracketType: "losers", // Set bracket type on round
      });
    }

    return rounds;
  }

  /**
   * Calculate number of matches in a specific losers bracket round
   */
  private static calculateLosersBracketMatches(
    round: number,
    totalPlayers: number
  ): number {
    if (round === 1) {
      // First losers round: half of first round losers
      return Math.ceil(totalPlayers / 4);
    } else if (round === 2) {
      // Second losers round: winners from round 1 + new losers from winners bracket
      return Math.ceil(totalPlayers / 4);
    } else {
      // Subsequent rounds: winners from previous losers round
      return Math.ceil(totalPlayers / Math.pow(2, round + 1));
    }
  }

  /**
   * Generate grand finals round for double elimination
   */
  private static generateGrandFinals(roundNumber: number): BracketRound {
    const grandFinals: BracketRound = {
      round: roundNumber,
      matches: [
        {
          player1Seed: "TBD", // Winner of winners bracket
          player2Seed: "TBD", // Winner of losers bracket
          player1Id: null,
          player2Id: null,
          matchNumber: 1,
          round: roundNumber,
          isBye: false,
          bracketType: "grand_finals",
          status: "PENDING",
          winnerId: null,
          nextMatchId: null,
        },
      ],
      bracketType: "grand_finals", // Set bracket type on round
    };

    return grandFinals;
  }

  /**
   * Generate Swiss system bracket
   * Swiss system: Pair players with similar scores
   * No elimination - everyone plays fixed number of rounds
   * Ideal for large tournaments (64+ players)
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
        if (round === 1) {
          // First round: assign actual players based on seeding
          const player1Index = i * 2;
          const player2Index = i * 2 + 1;

          const player1 = players[player1Index] || null;
          const player2 = players[player2Index] || null;

          // Handle byes in first round for odd player counts
          const isBye = !player1 || !player2;

          roundMatches.push({
            player1Seed: player1?.seedNumber || "BYE",
            player2Seed: player2?.seedNumber || "BYE",
            player1Id: player1?.userId || null,
            player2Id: player2?.userId || null,
            matchNumber: i + 1,
            round: 1,
            isBye,
            status: isBye ? "WAITING" : "PENDING",
            winnerId: isBye ? player1?.userId || player2?.userId || null : null,
            nextMatchId: null,
          });
        } else {
          // Subsequent rounds: TBD players (will be populated during tournament)
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
      }

      bracket.rounds.push({
        round,
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
   * Generate round robin bracket using Berger tables
   * Industry standard for professional round robin tournaments
   */
  private static generateRoundRobin(players: SeededPlayer[]): BracketStructure {
    const totalPlayers = players.length;
    const isOdd = totalPlayers % 2 === 1;
    const adjustedPlayers = isOdd ? totalPlayers + 1 : totalPlayers;
    const rounds = adjustedPlayers - 1;
    const matchesPerRound = Math.floor(adjustedPlayers / 2);

    const bracket: BracketStructure = {
      type: "ROUND_ROBIN",
      rounds: [],
      totalRounds: rounds,
      totalMatches: 0, // Will be calculated after generation
      players,
      generatedAt: new Date(),
    };

    // Generate Berger table pairings
    const bergerTable = this.generateBergerTable(players, isOdd);

    // Create rounds from Berger table
    for (let round = 1; round <= rounds; round++) {
      const roundMatches = this.createRoundRobinRound(
        bergerTable[round - 1],
        players,
        round,
        isOdd
      );

      bracket.rounds.push({
        round,
        matches: roundMatches,
      });
    }

    // Calculate total matches (excluding byes)
    bracket.totalMatches = bracket.rounds.reduce(
      (sum, round) =>
        sum + round.matches.filter((match) => !match.isBye).length,
      0
    );

    return bracket;
  }

  /**
   * Generate Berger table for round robin tournament
   * Uses the standard round-robin scheduling algorithm
   */
  private static generateBergerTable(
    players: SeededPlayer[],
    isOdd: boolean
  ): number[][][] {
    const totalPlayers = players.length;
    const adjustedPlayers = isOdd ? totalPlayers + 1 : totalPlayers;
    const rounds = adjustedPlayers - 1;
    const matchesPerRound = Math.floor(adjustedPlayers / 2);

    // Create list of all players (0 to adjustedPlayers-1)
    // If odd number, the last index represents "bye"
    const playerList = Array.from({ length: adjustedPlayers }, (_, i) => i);

    const bergerTable: number[][][] = [];

    for (let round = 0; round < rounds; round++) {
      const roundPairings: number[][] = [];

      // Standard round-robin algorithm:
      // Player 0 is fixed, others rotate
      for (let match = 0; match < matchesPerRound; match++) {
        let player1Index: number;
        let player2Index: number;

        if (match === 0) {
          // First match: player 0 vs last player in current rotation
          player1Index = 0;
          player2Index = playerList[adjustedPlayers - 1];
        } else {
          // Other matches: pair players from opposite sides
          player1Index = playerList[match];
          player2Index = playerList[adjustedPlayers - 1 - match];
        }

        roundPairings.push([player1Index, player2Index]);
      }

      bergerTable.push(roundPairings);

      // Rotate all players except player 0 for next round
      if (round < rounds - 1) {
        const temp = playerList[adjustedPlayers - 1];
        for (let i = adjustedPlayers - 1; i > 1; i--) {
          playerList[i] = playerList[i - 1];
        }
        playerList[1] = temp;
      }
    }

    return bergerTable;
  }

  /**
   * Determine if players should swap colors for better balance
   */
  private static shouldSwapColors(
    round: number,
    match: number,
    player1Index: number,
    player2Index: number
  ): boolean {
    // Simple color balancing heuristic
    // In practice, this could be more sophisticated
    return (round + match + player1Index + player2Index) % 2 === 1;
  }

  /**
   * Create matches for a specific round robin round
   */
  private static createRoundRobinRound(
    roundPairings: number[][],
    players: SeededPlayer[],
    roundNumber: number,
    isOdd: boolean
  ): BracketMatch[] {
    const matches: BracketMatch[] = [];
    const totalPlayers = players.length;

    roundPairings.forEach((pairing, matchIndex) => {
      const [player1Index, player2Index] = pairing;

      // Check if this is a bye match (for odd number of players)
      // In Berger tables for odd players, we add a dummy player at index = totalPlayers
      const isByeMatch =
        isOdd &&
        (player1Index === totalPlayers || player2Index === totalPlayers);

      if (isByeMatch) {
        // Create bye match
        const activePlayerIndex =
          player1Index < totalPlayers ? player1Index : player2Index;
        const activePlayer = players[activePlayerIndex];

        matches.push({
          player1Seed: activePlayer.seedNumber,
          player2Seed: "BYE",
          player1Id: activePlayer.userId,
          player2Id: null,
          matchNumber: matchIndex + 1,
          round: roundNumber,
          isBye: true,
          status: "COMPLETED",
          winnerId: activePlayer.userId,
          nextMatchId: null,
        });
      } else {
        // Create normal match
        const player1 = players[player1Index];
        const player2 = players[player2Index];

        matches.push({
          player1Seed: player1.seedNumber,
          player2Seed: player2.seedNumber,
          player1Id: player1.userId,
          player2Id: player2.userId,
          matchNumber: matchIndex + 1,
          round: roundNumber,
          isBye: false,
          status: "PENDING",
          winnerId: null,
          nextMatchId: null,
        });
      }
    });

    return matches;
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
        const roundMatches = matches.filter((m) => m.round === round.round);

        for (let i = 0; i < round.matches.length; i++) {
          const bracketMatch = round.matches[i];

          // For first round, try to match by player IDs first
          if (
            round.round === 1 &&
            bracketMatch.player1Id &&
            bracketMatch.player2Id
          ) {
            const dbMatch = roundMatches.find(
              (match) =>
                match.player1Id === bracketMatch.player1Id &&
                match.player2Id === bracketMatch.player2Id
            );
            if (dbMatch) {
              bracketMatch.id = dbMatch.id;
            }
          } else {
            // For other rounds or first round without player IDs, match by position
            const dbMatch = roundMatches[i];
            if (dbMatch) {
              bracketMatch.id = dbMatch.id;
              // Also update the player IDs if they exist in the database
              if (dbMatch.player1Id) {
                bracketMatch.player1Id = dbMatch.player1Id;
              }
              if (dbMatch.player2Id) {
                bracketMatch.player2Id = dbMatch.player2Id;
              }
            }
          }
        }
      }

      // Update tournament bracket in database
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { bracket: bracket as unknown as any },
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
      // Get the completed match
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          player1: true,
          player2: true,
        },
      });

      if (!match) {
        throw new Error("Match not found");
      }

      // Get the tournament bracket
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { bracket: true },
      });

      if (!tournament?.bracket) {
        throw new Error("Tournament bracket not found");
      }

      const bracket = tournament.bracket as unknown as BracketStructure;

      // Find the match in the bracket and update it
      let bracketMatch = null;
      let nextMatch = null;

      for (const round of bracket.rounds) {
        for (const bm of round.matches) {
          if (bm.id === matchId) {
            bracketMatch = bm;
            // Find the next match this winner should advance to
            nextMatch = this.findNextMatch(
              bracket,
              round.round,
              bm.matchNumber
            );
            break;
          }
        }
        if (bracketMatch) break;
      }

      if (bracketMatch) {
        // Update the completed match
        bracketMatch.winnerId = winnerId;
        bracketMatch.status = "COMPLETED";

        // Advance winner to next match if available
        if (nextMatch) {
          // Determine which player slot to fill based on match position
          const isFirstPlayer = bracketMatch.matchNumber % 2 === 1;

          if (isFirstPlayer) {
            nextMatch.player1Id = winnerId;
            // Get winner info for display
            const winner =
              match.player1?.id === winnerId ? match.player1 : match.player2;
            nextMatch.player1Info = winner;
          } else {
            nextMatch.player2Id = winnerId;
            // Get winner info for display
            const winner =
              match.player1?.id === winnerId ? match.player1 : match.player2;
            nextMatch.player2Info = winner;
          }

          // Update the database match
          await prisma.match.update({
            where: { id: nextMatch.id },
            data: {
              player1Id: nextMatch.player1Id,
              player2Id: nextMatch.player2Id,
            },
          });
        }

        // Update the tournament bracket in database
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { bracket: bracket as any },
        });

        logger.info(
          `Updated bracket for tournament ${tournamentId} after match ${matchId} completion`
        );
      }
    } catch (error) {
      logger.error(
        `Failed to update bracket after match ${matchId} completion`,
        { error }
      );
      throw error;
    }
  }

  /**
   * Find the next match a winner should advance to
   */
  private static findNextMatch(
    bracket: BracketStructure,
    currentRound: number,
    matchNumber: number
  ): any {
    if (currentRound >= bracket.totalRounds) return null;

    const nextRound = bracket.rounds.find((r) => r.round === currentRound + 1);
    if (!nextRound) return null;

    // Calculate which match in the next round this winner advances to
    const nextMatchNumber = Math.ceil(matchNumber / 2);
    return nextRound.matches.find((m) => m.matchNumber === nextMatchNumber);
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
   * Enhanced version with proper bracket path calculations
   */
  private static linkBracketProgression(bracket: BracketStructure): void {
    if (bracket.type === "DOUBLE_ELIMINATION") {
      // Double elimination uses specialized linking
      this.linkDoubleEliminationProgression(bracket);
      return;
    }

    // For single elimination and other types
    this.linkSingleEliminationProgression(bracket);
  }

  /**
   * Link single elimination bracket progression with proper path calculations
   */
  private static linkSingleEliminationProgression(
    bracket: BracketStructure
  ): void {
    for (
      let roundIndex = 0;
      roundIndex < bracket.rounds.length - 1;
      roundIndex++
    ) {
      const currentRound = bracket.rounds[roundIndex];
      const nextRound = bracket.rounds[roundIndex + 1];

      // Calculate proper progression paths
      currentRound.matches.forEach((match, matchIndex) => {
        const progressionPath = this.calculateProgressionPath(
          matchIndex,
          currentRound.matches.length,
          nextRound.matches.length
        );

        if (progressionPath.isValid) {
          const nextMatch = nextRound.matches[progressionPath.nextMatchIndex];
          // Store the next match reference for progression (will be updated with actual DB ID later)
          match.nextMatchId = `round${nextRound.round}_match${
            progressionPath.nextMatchIndex + 1
          }`;

          // Assign winner to appropriate slot in next match
          if (progressionPath.slot === 1) {
            nextMatch.player1Id = null;
            nextMatch.player1Seed = "TBD";
          } else {
            nextMatch.player2Id = null;
            nextMatch.player2Seed = "TBD";
          }

          // Update match status
          this.updateMatchStatus(nextMatch);
        }
      });
    }
  }

  /**
   * Calculate proper progression path for a match
   */
  private static calculateProgressionPath(
    currentMatchIndex: number,
    currentRoundMatches: number,
    nextRoundMatches: number
  ): { isValid: boolean; nextMatchIndex: number; slot: number } {
    // Handle edge cases
    if (nextRoundMatches === 0) {
      return { isValid: false, nextMatchIndex: -1, slot: -1 };
    }

    // Calculate the bracket path using proper tournament bracket logic
    const bracketSize = currentRoundMatches * 2;
    const nextBracketSize = nextRoundMatches * 2;

    // Calculate position in the bracket tree
    const positionInBracket = currentMatchIndex * 2;
    const nextPosition = Math.floor(positionInBracket / 2);

    if (nextPosition >= nextRoundMatches) {
      return { isValid: false, nextMatchIndex: -1, slot: -1 };
    }

    // Determine which slot (player1 or player2) in the next match
    const slot = (positionInBracket % 2) + 1;

    return {
      isValid: true,
      nextMatchIndex: nextPosition,
      slot,
    };
  }

  /**
   * Update match status based on player assignments
   */
  private static updateMatchStatus(match: BracketMatch): void {
    if (match.player1Id && match.player2Id) {
      match.status = "PENDING";
    } else if (match.player1Id || match.player2Id) {
      match.status = "WAITING";
    } else {
      match.status = "WAITING";
    }
  }

  /**
   * Link double elimination bracket progression
   */
  private static linkDoubleEliminationProgression(
    bracket: BracketStructure
  ): void {
    // Link winners bracket progression
    this.linkWinnersBracketProgression(bracket);

    // Link losers bracket progression
    this.linkLosersBracketProgression(bracket);

    // Link to grand finals
    this.linkToGrandFinals(bracket);
  }

  /**
   * Link winners bracket progression
   */
  private static linkWinnersBracketProgression(
    bracket: BracketStructure
  ): void {
    const winnersRounds = bracket.rounds.filter(
      (round) => round.matches[0]?.bracketType === "winners"
    );

    for (let i = 0; i < winnersRounds.length - 1; i++) {
      const currentRound = winnersRounds[i];
      const nextRound = winnersRounds[i + 1];

      currentRound.matches.forEach((match, matchIndex) => {
        const nextMatchIndex = Math.floor(matchIndex / 2);
        if (nextMatchIndex < nextRound.matches.length) {
          const nextMatch = nextRound.matches[nextMatchIndex];
          match.nextMatchId = `winners_${nextRound.round}_${
            nextMatchIndex + 1
          }`;
        }
      });
    }
  }

  /**
   * Link losers bracket progression
   */
  private static linkLosersBracketProgression(bracket: BracketStructure): void {
    const losersRounds = bracket.rounds.filter(
      (round) => round.matches[0]?.bracketType === "losers"
    );

    // Link losers bracket rounds
    for (let i = 0; i < losersRounds.length - 1; i++) {
      const currentRound = losersRounds[i];
      const nextRound = losersRounds[i + 1];

      currentRound.matches.forEach((match, matchIndex) => {
        const nextMatchIndex = Math.floor(matchIndex / 2);
        if (nextMatchIndex < nextRound.matches.length) {
          const nextMatch = nextRound.matches[nextMatchIndex];
          match.nextMatchId = `losers_${nextRound.round}_${nextMatchIndex + 1}`;
        }
      });
    }
  }

  /**
   * Link winners and losers brackets to grand finals
   */
  private static linkToGrandFinals(bracket: BracketStructure): void {
    const grandFinals = bracket.rounds.find(
      (round) => round.matches[0]?.bracketType === "grand_finals"
    );

    if (!grandFinals) return;

    // Link winner of winners bracket to grand finals
    const winnersBracket = bracket.rounds.filter(
      (round) => round.matches[0]?.bracketType === "winners"
    );
    const finalWinnersRound = winnersBracket[winnersBracket.length - 1];

    if (finalWinnersRound && finalWinnersRound.matches.length > 0) {
      const winnersFinal = finalWinnersRound.matches[0];
      winnersFinal.nextMatchId = `grand_finals_1`;
    }

    // Link winner of losers bracket to grand finals
    const losersBracket = bracket.rounds.filter(
      (round) => round.matches[0]?.bracketType === "losers"
    );
    const finalLosersRound = losersBracket[losersBracket.length - 1];

    if (finalLosersRound && finalLosersRound.matches.length > 0) {
      const losersFinal = finalLosersRound.matches[0];
      losersFinal.nextMatchId = `grand_finals_1`;
    }
  }

  /**
   * Validate bracket integrity and fairness
   */
  private static validateBracket(
    bracket: BracketStructure
  ): BracketValidationResult {
    const validator = new BracketValidator(bracket);
    return validator.validate();
  }

  /**
   * Regenerate bracket with validation
   */
  static async generateBracketWithValidation(
    tournamentId: string,
    useAdvancedSeeding: boolean = false
  ): Promise<BracketStructure> {
    try {
      const bracket = await this.generateBracket(
        tournamentId,
        useAdvancedSeeding
      );

      // Validate the generated bracket
      const validation = this.validateBracket(bracket);

      if (!validation.isValid) {
        logger.error(
          `Bracket validation failed for tournament ${tournamentId}`,
          {
            errors: validation.errors,
            warnings: validation.warnings,
          }
        );

        // Attempt to fix common issues
        const fixedBracket = this.attemptBracketFix(bracket, validation.errors);
        if (fixedBracket) {
          const fixedValidation = this.validateBracket(fixedBracket);
          if (fixedValidation.isValid) {
            logger.info(
              `Bracket fixed and validated for tournament ${tournamentId}`
            );
            return fixedBracket;
          }
        }

        // If fixing fails, throw error
        throw new Error(
          `Bracket validation failed: ${validation.errors.join(", ")}`
        );
      }

      logger.info(
        `Bracket validated successfully for tournament ${tournamentId}`
      );
      return bracket;
    } catch (error) {
      logger.error(`Failed to generate validated bracket: ${error}`);
      throw error;
    }
  }

  /**
   * Attempt to fix common bracket issues
   */
  private static attemptBracketFix(
    bracket: BracketStructure,
    errors: string[]
  ): BracketStructure | null {
    try {
      const fixedBracket = { ...bracket };

      // Fix progression linking issues
      if (errors.some((error) => error.includes("progression"))) {
        this.linkBracketProgression(fixedBracket);
      }

      // Fix bye distribution issues
      if (errors.some((error) => error.includes("bye"))) {
        this.redistributeByes(fixedBracket);
      }

      // Fix seeding issues
      if (errors.some((error) => error.includes("seeding"))) {
        this.fixSeeding(fixedBracket);
      }

      return fixedBracket;
    } catch (error) {
      logger.error("Failed to fix bracket issues", { error });
      return null;
    }
  }

  /**
   * Redistribute byes to fix unfair distributions
   */
  private static redistributeByes(bracket: BracketStructure): void {
    // Implementation for bye redistribution
    // This would analyze the current bye distribution and make it more fair
  }

  /**
   * Fix seeding issues in the bracket
   */
  private static fixSeeding(bracket: BracketStructure): void {
    // Implementation for fixing seeding issues
    // This would ensure proper seed distribution across the bracket
  }

  /**
   * Create matches in database for the generated bracket
   */
  private static async createMatches(
    tournamentId: string,
    bracket: BracketStructure
  ): Promise<void> {
    try {
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

      const matches = [];

      // Only create matches for the first round initially
      // Subsequent round matches will be created as players advance
      const firstRound = bracket.rounds.find((round) => round.round === 1);

      if (firstRound) {
        for (const match of firstRound.matches) {
          // Create matches for all first round games, including byes
          // For bye matches, we still want to create the match to track progression
          if (match.player1Id || match.player2Id) {
            matches.push({
              player1Id: match.player1Id,
              player2Id: match.player2Id,
              gameId: tournament.gameId,
              tournamentId,
              round: 1,
              status: match.isBye ? "WAITING" : "PENDING",
              result: "PENDING",
            });
          }
        }
      }

      if (matches.length > 0) {
        logger.info(
          `Creating ${matches.length} first-round matches for tournament ${tournamentId}`
        );

        const createdMatches = await prisma.match.createMany({
          data: matches,
        });

        // Update bracket with actual match IDs for first round only
        await this.updateBracketWithMatchIds(tournamentId, bracket);

        // Emit match_available events for all created matches
        const tournament = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { title: true },
        });

        for (const match of matches) {
          EventBus.emitTournamentEvent("tournament:match_available", {
            matchId: match.id || `temp_${Date.now()}_${Math.random()}`,
            tournamentId,
            tournamentName: tournament?.title || "Tournament",
            player1Id: match.player1Id,
            player2Id: match.player2Id,
            round: match.round,
          });
        }

        logger.info(
          `Created ${matches.length} first-round matches for tournament ${tournamentId}`
        );
      } else {
        logger.warn(
          `No valid first-round matches to create for tournament ${tournamentId}`
        );
      }
    } catch (error) {
      logger.error(`Failed to create matches for tournament ${tournamentId}`, {
        error,
      });
      throw error;
    }
  }
}

/**
 * Bracket validation result
 */
export interface BracketValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    totalMatches: number;
    totalRounds: number;
    byeCount: number;
    progressionIssues: number;
    seedingIssues: number;
  };
}

/**
 * Bracket validator class
 */
class BracketValidator {
  private bracket: BracketStructure;
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(bracket: BracketStructure) {
    this.bracket = bracket;
  }

  /**
   * Validate the entire bracket
   */
  validate(): BracketValidationResult {
    this.errors = [];
    this.warnings = [];

    // Basic structure validation
    this.validateBasicStructure();

    // Progression validation
    this.validateProgression();

    // Seeding validation
    this.validateSeeding();

    // Bye validation
    this.validateByeDistribution();

    // Tournament-specific validation
    this.validateTournamentSpecific();

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      details: {
        totalMatches: this.bracket.totalMatches,
        totalRounds: this.bracket.totalRounds,
        byeCount: this.countByes(),
        progressionIssues: this.countProgressionIssues(),
        seedingIssues: this.countSeedingIssues(),
      },
    };
  }

  /**
   * Validate basic bracket structure
   */
  private validateBasicStructure(): void {
    if (!this.bracket.rounds || this.bracket.rounds.length === 0) {
      this.errors.push("Bracket has no rounds");
      return;
    }

    if (this.bracket.totalRounds !== this.bracket.rounds.length) {
      this.errors.push(
        `Total rounds mismatch: expected ${this.bracket.totalRounds}, got ${this.bracket.rounds.length}`
      );
    }

    const actualTotalMatches = this.calculateTotalMatches();

    if (this.bracket.type === "ROUND_ROBIN") {
      // For round robin, totalMatches should equal non-bye matches
      const actualNonByeMatches = this.bracket.rounds.reduce(
        (sum, round) =>
          sum + round.matches.filter((match) => !match.isBye).length,
        0
      );

      if (this.bracket.totalMatches !== actualNonByeMatches) {
        this.errors.push(
          `Total matches mismatch: expected ${this.bracket.totalMatches}, got ${actualNonByeMatches}`
        );
      }
    } else {
      // For elimination brackets, totalMatches should equal total match slots
      if (this.bracket.totalMatches !== actualTotalMatches) {
        this.errors.push(
          `Total matches mismatch: expected ${this.bracket.totalMatches}, got ${actualTotalMatches}`
        );
      }
    }

    // Validate round numbers are sequential
    for (let i = 0; i < this.bracket.rounds.length; i++) {
      if (this.bracket.rounds[i].round !== i + 1) {
        this.errors.push(
          `Round number mismatch at index ${i}: expected ${i + 1}, got ${
            this.bracket.rounds[i].round
          }`
        );
      }
    }
  }

  /**
   * Validate bracket progression
   */
  private validateProgression(): void {
    for (let i = 0; i < this.bracket.rounds.length - 1; i++) {
      const currentRound = this.bracket.rounds[i];
      const nextRound = this.bracket.rounds[i + 1];

      currentRound.matches.forEach((match, matchIndex) => {
        if (
          match.nextMatchId &&
          !this.isValidNextMatch(match.nextMatchId, nextRound)
        ) {
          this.errors.push(
            `Invalid progression from round ${currentRound.round} match ${
              matchIndex + 1
            }`
          );
        }
      });
    }
  }

  /**
   * Validate seeding distribution
   */
  private validateSeeding(): void {
    const firstRound = this.bracket.rounds[0];
    if (!firstRound) return;

    const seeds = new Set<number>();
    firstRound.matches.forEach((match) => {
      if (typeof match.player1Seed === "number") {
        if (seeds.has(match.player1Seed)) {
          this.errors.push(
            `Duplicate seed ${match.player1Seed} in first round`
          );
        }
        seeds.add(match.player1Seed);
      }
      if (typeof match.player2Seed === "number") {
        if (seeds.has(match.player2Seed)) {
          this.errors.push(
            `Duplicate seed ${match.player2Seed} in first round`
          );
        }
        seeds.add(match.player2Seed);
      }
    });

    // Check for missing seeds
    const expectedSeeds = this.bracket.players.length;
    if (seeds.size !== expectedSeeds) {
      this.warnings.push(
        `Expected ${expectedSeeds} seeds, found ${seeds.size}`
      );
    }
  }

  /**
   * Validate bye distribution
   */
  private validateByeDistribution(): void {
    const firstRound = this.bracket.rounds[0];
    if (!firstRound) return;

    const byes = firstRound.matches.filter((match) => match.isBye);
    const totalPlayers = this.bracket.players.length;
    const expectedByes = this.calculateExpectedByes(totalPlayers);

    if (byes.length !== expectedByes) {
      this.errors.push(
        `Bye count mismatch: expected ${expectedByes}, got ${byes.length}`
      );
    }

    // Check that byes are properly handled
    byes.forEach((match) => {
      if (!match.winnerId) {
        this.errors.push(
          `Bye match missing winner: round ${match.round} match ${match.matchNumber}`
        );
      }
    });
  }

  /**
   * Validate tournament-specific rules
   */
  private validateTournamentSpecific(): void {
    switch (this.bracket.type) {
      case "DOUBLE_ELIMINATION":
        this.validateDoubleElimination();
        break;
      case "SWISS":
        this.validateSwissSystem();
        break;
      case "ROUND_ROBIN":
        this.validateRoundRobin();
        break;
    }
  }

  /**
   * Validate double elimination specific rules
   */
  private validateDoubleElimination(): void {
    const winnersRounds = this.bracket.rounds.filter(
      (round) => round.matches[0]?.bracketType === "winners"
    );
    const losersRounds = this.bracket.rounds.filter(
      (round) => round.matches[0]?.bracketType === "losers"
    );
    const grandFinals = this.bracket.rounds.filter(
      (round) => round.matches[0]?.bracketType === "grand_finals"
    );

    if (winnersRounds.length === 0) {
      this.errors.push("Double elimination bracket missing winners bracket");
    }

    if (losersRounds.length === 0) {
      this.errors.push("Double elimination bracket missing losers bracket");
    }

    if (grandFinals.length === 0) {
      this.errors.push("Double elimination bracket missing grand finals");
    }
  }

  /**
   * Validate Swiss system specific rules
   */
  private validateSwissSystem(): void {
    // Swiss system validation logic
  }

  /**
   * Validate round robin specific rules
   */
  private validateRoundRobin(): void {
    const totalPlayers = this.bracket.players.length;
    const isOdd = totalPlayers % 2 === 1;
    const adjustedPlayers = isOdd ? totalPlayers + 1 : totalPlayers;
    const expectedRounds = adjustedPlayers - 1;

    // Validate round count
    if (this.bracket.totalRounds !== expectedRounds) {
      this.errors.push(
        `Round robin should have ${expectedRounds} rounds for ${totalPlayers} players, got ${this.bracket.totalRounds}`
      );
    }

    // Validate that each player plays every other player exactly once
    const matchups = new Set<string>();
    let totalMatches = 0;

    this.bracket.rounds.forEach((round, roundIndex) => {
      round.matches.forEach((match) => {
        if (!match.isBye && match.player1Id && match.player2Id) {
          totalMatches++;

          // Create sorted matchup key to detect duplicates
          const matchupKey = [match.player1Id, match.player2Id]
            .sort()
            .join("-");

          if (matchups.has(matchupKey)) {
            this.errors.push(
              `Duplicate matchup detected: ${match.player1Id} vs ${match.player2Id} in round ${round.round}`
            );
          }

          matchups.add(matchupKey);
        }
      });
    });

    // Validate total number of matches
    const expectedMatches = (totalPlayers * (totalPlayers - 1)) / 2;
    if (totalMatches !== expectedMatches) {
      this.errors.push(
        `Round robin should have ${expectedMatches} total matches for ${totalPlayers} players, got ${totalMatches}`
      );
    }

    // Validate bye distribution for odd player counts
    if (isOdd) {
      const byesPerRound = this.bracket.rounds.map(
        (round) => round.matches.filter((match) => match.isBye).length
      );

      const expectedByesPerRound = 1;
      byesPerRound.forEach((byes, roundIndex) => {
        if (byes !== expectedByesPerRound) {
          this.errors.push(
            `Round ${
              roundIndex + 1
            } should have ${expectedByesPerRound} bye, got ${byes}`
          );
        }
      });

      // Check that each player gets exactly one bye
      const playerByes = new Map<string, number>();
      this.bracket.rounds.forEach((round) => {
        round.matches.forEach((match) => {
          if (match.isBye && match.player1Id) {
            const currentByes = playerByes.get(match.player1Id) || 0;
            playerByes.set(match.player1Id, currentByes + 1);
          }
        });
      });

      this.bracket.players.forEach((player) => {
        const byes = playerByes.get(player.userId) || 0;
        if (byes !== 1) {
          this.errors.push(
            `Player ${player.userId} should have exactly 1 bye, got ${byes}`
          );
        }
      });
    }
  }

  /**
   * Check if next match ID is valid
   */
  private isValidNextMatch(
    nextMatchId: string,
    nextRound: BracketRound
  ): boolean {
    // Implementation to validate next match ID
    return true; // Placeholder
  }

  /**
   * Calculate expected number of byes
   */
  private calculateExpectedByes(playerCount: number): number {
    if (this.bracket.type === "ROUND_ROBIN") {
      // For round robin, if odd players, each gets exactly one bye total across all rounds
      return playerCount % 2 === 1 ? playerCount : 0;
    } else {
      // For elimination brackets (single/double), calculate bracket size
      let bracketSize = 2;
      while (bracketSize < playerCount) {
        bracketSize *= 2;
      }
      return bracketSize - playerCount;
    }
  }

  /**
   * Count total matches in bracket
   */
  private calculateTotalMatches(): number {
    return this.bracket.rounds.reduce(
      (sum, round) => sum + round.matches.length,
      0
    );
  }

  /**
   * Count byes in bracket
   */
  private countByes(): number {
    return this.bracket.rounds.reduce(
      (sum, round) => sum + round.matches.filter((match) => match.isBye).length,
      0
    );
  }

  /**
   * Count progression issues
   */
  private countProgressionIssues(): number {
    // Implementation to count progression issues
    return 0; // Placeholder
  }

  /**
   * Count seeding issues
   */
  private countSeedingIssues(): number {
    // Implementation to count seeding issues
    return 0; // Placeholder
  }
}
