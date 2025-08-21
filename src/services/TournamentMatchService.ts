import { PrismaClient, MatchStatus, MatchResult } from "@prisma/client";
import logger from "../config/logger";
import {
  BracketGenerationService,
  BracketStructure,
} from "./BracketGenerationService";

const prisma = new PrismaClient();

export interface MatchUpdateData {
  winnerId: string;
  result: MatchResult;
  duration?: number;
  metadata?: any;
}

export class TournamentMatchService {
  /**
   * Create tournament matches from bracket
   */
  static async createTournamentMatches(
    tournamentId: string,
    bracket: BracketStructure
  ): Promise<void> {
    // Note: Matches are already created by BracketGenerationService
    // This method is kept for backward compatibility but doesn't duplicate match creation
    logger.info(
      `Tournament matches already created by bracket generation for tournament ${tournamentId}`
    );
  }

  /**
   * Update match result and advance winner
   */
  static async updateMatchResult(
    matchId: string,
    data: MatchUpdateData
  ): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });

    if (!match?.tournament) {
      throw new Error("Match or tournament not found");
    }

    // Update match with result
    await prisma.match.update({
      where: { id: matchId },
      data: {
        winnerId: data.winnerId,
        result: data.result,
        status: "COMPLETED",
        finishedAt: new Date(),
        duration: data.duration,
        gameData: data.metadata, // Store metadata in gameData field
      },
    });

    // Advance winner to next round
    await this.advanceWinner(matchId);

    logger.info(`Match ${matchId} completed, winner ${data.winnerId} advanced`);
  }

  /**
   * Advance winner to next round
   */
  static async advanceWinner(matchId: string): Promise<void> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });

    if (!match?.winnerId || !match.tournament) {
      return;
    }

    const bracket = match.tournament.bracket as unknown as BracketStructure;
    if (!bracket) {
      logger.warn(`No bracket found for tournament ${match.tournamentId}`);
      return;
    }

    const currentRound = match.round!;
    const nextRound = currentRound + 1;

    if (nextRound <= bracket.totalRounds) {
      await this.createNextRoundMatch(
        match.tournamentId!,
        nextRound,
        match.winnerId,
        bracket
      );
    } else {
      // Tournament completed
      await this.handleTournamentCompletion(match.tournamentId!);
    }
  }

  /**
   * Create next round match with winner
   */
  private static async createNextRoundMatch(
    tournamentId: string,
    roundNumber: number,
    winnerId: string,
    bracket: BracketStructure
  ): Promise<void> {
    const round = bracket.rounds.find((r) => r.roundNumber === roundNumber);
    if (!round) {
      logger.warn(
        `Round ${roundNumber} not found in bracket for tournament ${tournamentId}`
      );
      return;
    }

    // Find the next available match slot
    const availableMatch = round.matches.find(
      (m) => m.player1Id === null || m.player2Id === null
    );

    if (availableMatch) {
      // Update the bracket with the winner
      if (availableMatch.player1Id === null) {
        availableMatch.player1Id = winnerId;
        availableMatch.player1Seed = this.getPlayerSeed(winnerId, bracket);
      } else {
        availableMatch.player2Id = winnerId;
        availableMatch.player2Seed = this.getPlayerSeed(winnerId, bracket);
      }

      // Update bracket in database
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { bracket: bracket as any },
      });

      // Create the actual match if both players are now known
      if (availableMatch.player1Id && availableMatch.player2Id) {
        // Get tournament to get gameId
        const tournament = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { gameId: true },
        });

        if (tournament) {
          await prisma.match.create({
            data: {
              player1Id: availableMatch.player1Id,
              player2Id: availableMatch.player2Id,
              gameId: tournament.gameId,
              tournamentId: tournamentId,
              round: roundNumber,
              status: "PENDING",
              result: "PENDING",
            },
          });
        }

        logger.info(
          `Created round ${roundNumber} match for tournament ${tournamentId}`
        );
      }
    }
  }

  /**
   * Get player seed number from bracket
   */
  private static getPlayerSeed(
    playerId: string,
    bracket: BracketStructure
  ): number {
    const player = bracket.players.find((p) => p.userId === playerId);
    return player?.seedNumber || 0;
  }

  /**
   * Handle tournament completion
   */
  private static async handleTournamentCompletion(
    tournamentId: string
  ): Promise<void> {
    try {
      // Get final standings
      const finalMatches = await prisma.match.findMany({
        where: {
          tournamentId,
          status: "COMPLETED",
          round: { gte: 1 },
        },
        include: { player1: true, player2: true },
        orderBy: { round: "desc" },
      });

      // Determine winners (top 3)
      const winners = this.calculateFinalStandings(finalMatches);

      // Update tournament status
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: "COMPLETED",
          endDate: new Date(),
        },
      });

      // Update player placements
      for (const [placement, player] of winners.entries()) {
        await prisma.tournamentPlayer.update({
          where: {
            userId_tournamentId: {
              userId: player.userId,
              tournamentId,
            },
          },
          data: {
            placement: placement + 1,
            isEliminated: true,
          },
        });
      }

      logger.info(
        `Tournament ${tournamentId} completed with ${winners.length} winners`
      );
    } catch (error) {
      logger.error(`Error completing tournament ${tournamentId}`, { error });
    }
  }

  /**
   * Calculate final standings based on completed matches
   */
  private static calculateFinalStandings(matches: any[]): any[] {
    // This is a simplified calculation
    // In practice, you'd want more sophisticated tie-breaking logic

    const playerStats = new Map();

    // Count wins for each player
    for (const match of matches) {
      if (match.winnerId) {
        const current = playerStats.get(match.winnerId) || {
          wins: 0,
          losses: 0,
        };
        current.wins++;
        playerStats.set(match.winnerId, current);
      }

      // Count losses
      const loserId =
        match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
      const current = playerStats.get(loserId) || { wins: 0, losses: 0 };
      current.losses++;
      playerStats.set(loserId, current);
    }

    // Sort by wins, then by losses
    const sortedPlayers = Array.from(playerStats.entries())
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.losses - b.losses;
      });

    return sortedPlayers.slice(0, 3); // Top 3
  }

  /**
   * Get tournament matches
   */
  static async getTournamentMatches(tournamentId: string): Promise<any[]> {
    return await prisma.match.findMany({
      where: { tournamentId },
      include: {
        player1: true,
        player2: true,
        // winner field doesn't exist in Match model, using winnerId instead
      },
      orderBy: [{ round: "asc" }, { createdAt: "asc" }],
    });
  }

  /**
   * Get matches for a specific round
   */
  static async getRoundMatches(
    tournamentId: string,
    round: number
  ): Promise<any[]> {
    return await prisma.match.findMany({
      where: {
        tournamentId,
        round,
      },
      include: {
        player1: true,
        player2: true,
        // winner field doesn't exist in Match model, using winnerId instead
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Get player's next match
   */
  static async getPlayerNextMatch(
    tournamentId: string,
    userId: string
  ): Promise<any | null> {
    return await prisma.match.findFirst({
      where: {
        tournamentId,
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: "PENDING",
      },
      include: {
        player1: true,
        player2: true,
      },
      orderBy: { round: "asc" },
    });
  }

  /**
   * Check if tournament is ready for next round
   */
  static async isRoundComplete(
    tournamentId: string,
    round: number
  ): Promise<boolean> {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId,
        round,
      },
    });

    if (matches.length === 0) return false;

    return matches.every((match) => match.status === "COMPLETED");
  }

  /**
   * Get tournament progress summary
   */
  static async getTournamentProgress(tournamentId: string): Promise<{
    totalMatches: number;
    completedMatches: number;
    currentRound: number;
    nextRoundReady: boolean;
  }> {
    const matches = await this.getTournamentMatches(tournamentId);
    const totalMatches = matches.length;
    const completedMatches = matches.filter(
      (m) => m.status === "COMPLETED"
    ).length;

    const currentRound = Math.max(...matches.map((m) => m.round || 0));
    const nextRoundReady = await this.isRoundComplete(
      tournamentId,
      currentRound
    );

    return {
      totalMatches,
      completedMatches,
      currentRound,
      nextRoundReady,
    };
  }
}
