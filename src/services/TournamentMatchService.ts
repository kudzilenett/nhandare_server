import { PrismaClient, MatchStatus, MatchResult } from "@prisma/client";
import logger from "../config/logger";
import EventBus from "../utils/EventBus";
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

    // Update the bracket structure to show the winner
    await this.updateBracketAfterMatch(
      match.tournamentId!,
      matchId,
      data.winnerId!
    );

    // Advance winner to next round
    await this.advanceWinner(matchId);

    logger.info(`Match ${matchId} completed, winner ${data.winnerId} advanced`);
  }

  /**
   * Complete a tournament match and advance the winner
   */
  static async completeMatch(
    matchId: string,
    winnerId: string,
    gameData?: any
  ): Promise<void> {
    try {
      // Get the match with tournament info
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          tournament: true,
          player1: true,
          player2: true,
        },
      });

      if (!match?.tournament) {
        throw new Error("Match or tournament not found");
      }

      // Update the match with the result
      await prisma.match.update({
        where: { id: matchId },
        data: {
          status: "COMPLETED",
          winnerId,
          result: winnerId === match.player1Id ? "PLAYER1_WIN" : "PLAYER2_WIN",
          finishedAt: new Date(),
          gameData,
        },
      });

      // Update the bracket structure
      await this.updateBracketAfterMatch(
        match.tournamentId!,
        matchId,
        winnerId
      );

      // Advance winner to next round if not the final round
      await this.advanceWinner(matchId);

      logger.info(`Match ${matchId} completed, winner ${winnerId} advanced`);
    } catch (error) {
      logger.error(`Failed to complete match ${matchId}`, { error });
      throw error;
    }
  }

  /**
   * Update bracket after a match is completed
   */
  private static async updateBracketAfterMatch(
    tournamentId: string,
    matchId: string,
    winnerId: string
  ): Promise<void> {
    try {
      console.log(
        `🔍 [DEBUG] Updating bracket for tournament ${tournamentId}, match ${matchId}, winner ${winnerId}`
      );

      // Get the tournament bracket
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { bracket: true },
      });

      if (!tournament?.bracket) {
        console.log(
          `❌ [DEBUG] No bracket found for tournament ${tournamentId}`
        );
        return;
      }

      console.log(
        `✅ [DEBUG] Found bracket with ${
          (tournament.bracket as any)?.rounds?.length || 0
        } rounds`
      );

      const bracket = tournament.bracket as any;

      // Find the completed match in the bracket
      let bracketMatch = null;
      for (const round of bracket.rounds) {
        for (const bm of round.matches) {
          if (bm.id === matchId) {
            bracketMatch = bm;
            console.log(
              `✅ [DEBUG] Found match in bracket: round ${round.round}, match ${bm.matchNumber}`
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

        console.log(
          `✅ [DEBUG] Updated bracket match: winnerId=${bracketMatch.winnerId}, status=${bracketMatch.status}`
        );

        // Update the tournament bracket in database
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { bracket: bracket as any },
        });

        console.log(`✅ [DEBUG] Bracket saved to database`);

        logger.info(
          `Updated bracket for tournament ${tournamentId} after match ${matchId} completion`
        );
      } else {
        console.log(`❌ [DEBUG] Match ${matchId} not found in bracket`);
      }
    } catch (error) {
      console.error(`❌ [DEBUG] Error updating bracket:`, error);
      logger.error(
        `Failed to update bracket after match ${matchId} completion`,
        { error }
      );
      throw error;
    }
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

      // Emit round advancement event
      EventBus.emitTournamentEvent("tournament:round_advanced", {
        tournamentId: match.tournamentId!,
        tournamentName: match.tournament.title,
        currentRound: nextRound,
        totalRounds: bracket.totalRounds,
        previousRound: currentRound,
      });
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
    const round = bracket.rounds.find((r) => r.round === roundNumber);
    if (!round) {
      logger.warn(
        `Round ${roundNumber} not found in bracket for tournament ${tournamentId}`
      );
      return;
    }

    // Find the winner's match from the previous round
    const winnerMatch = await prisma.match.findFirst({
      where: {
        tournamentId,
        round: roundNumber - 1,
        winnerId,
      },
    });

    if (!winnerMatch) {
      logger.warn(`Winner match not found for round ${roundNumber - 1}`);
      return;
    }

    // Get all matches from the previous round to calculate match number
    const previousRoundMatches = await prisma.match.findMany({
      where: {
        tournamentId,
        round: roundNumber - 1,
      },
      orderBy: { createdAt: "asc" },
    });

    // Find the position of the winner's match in the previous round
    const winnerMatchIndex = previousRoundMatches.findIndex(
      (m) => m.id === winnerMatch.id
    );
    if (winnerMatchIndex === -1) {
      logger.warn(`Winner match not found in previous round matches`);
      return;
    }

    // Calculate which match in the next round this winner should advance to
    const nextMatchNumber = Math.ceil((winnerMatchIndex + 1) / 2);
    const nextMatch = round.matches.find(
      (m) => m.matchNumber === nextMatchNumber
    );

    if (!nextMatch) {
      logger.warn(
        `Next match not found in bracket for round ${roundNumber}, match ${nextMatchNumber}`
      );
      return;
    }

    // Update the bracket with the winner
    if (nextMatch.player1Id === null) {
      nextMatch.player1Id = winnerId;
      nextMatch.player1Seed = this.getPlayerSeed(winnerId, bracket);
    } else if (nextMatch.player2Id === null) {
      nextMatch.player2Id = winnerId;
      nextMatch.player2Seed = this.getPlayerSeed(winnerId, bracket);
    } else {
      logger.warn(
        `Both player slots are filled for match ${nextMatch.id} in round ${roundNumber}`
      );
      return;
    }

    // Update bracket in database
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { bracket: bracket as any },
    });

    // Create the actual match if both players are now known
    if (nextMatch.player1Id && nextMatch.player2Id) {
      // Get tournament to get gameId
      const tournament = await prisma.match.findUnique({
        where: { id: winnerMatch.id },
        select: { gameId: true },
      });

      if (tournament?.gameId) {
        const newMatch = await prisma.match.create({
          data: {
            player1Id: nextMatch.player1Id,
            player2Id: nextMatch.player2Id,
            gameId: tournament.gameId,
            tournamentId: tournamentId,
            round: roundNumber,
            status: "PENDING",
            result: "PENDING",
          },
        });

        // Update the bracket match with the actual match ID
        nextMatch.id = newMatch.id;

        // Update bracket again with the match ID
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { bracket: bracket as any },
        });

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

  /**
   * Get tournament winners and final standings
   */
  static async getTournamentWinners(tournamentId: string): Promise<{
    winner?: { userId: string; username: string; prize?: number };
    runnerUp?: { userId: string; username: string; prize?: number };
    thirdPlace?: { userId: string; username: string; prize?: number };
    isCompleted: boolean;
  }> {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          matches: {
            where: { status: "COMPLETED" },
            orderBy: { round: "desc" },
          },
          players: {
            include: { user: true },
          },
        },
      });

      if (!tournament) {
        throw new Error("Tournament not found");
      }

      // Check if tournament is completed
      const isCompleted = tournament.status === "COMPLETED";
      if (!isCompleted) {
        return { isCompleted: false };
      }

      // Get the final match (highest round)
      const finalMatch = tournament.matches[0]; // Already ordered by round desc
      if (!finalMatch?.winnerId) {
        return { isCompleted: true };
      }

      // Get winner info
      const winner = tournament.players.find(
        (p) => p.userId === finalMatch.winnerId
      );
      if (!winner) {
        return { isCompleted: true };
      }

      // For now, return basic winner info
      // In a full implementation, you'd calculate prizes and find runner-up/third place
      return {
        winner: {
          userId: winner.userId,
          username: winner.user.username,
        },
        isCompleted: true,
      };
    } catch (error) {
      logger.error(`Failed to get tournament winners for ${tournamentId}`, {
        error,
      });
      throw error;
    }
  }
}
