import { PrismaClient } from "@prisma/client";
import logger from "../config/logger";
import { roundToCents } from "../utils/currency";

const prisma = new PrismaClient();

export interface TournamentWinner {
  userId: string;
  username: string;
  placement: number;
  prizeAmount: number;
}

export interface PrizeBreakdown {
  first: number;
  second: number;
  third: number;
}

export class TournamentCompletionService {
  /**
   * Check if a tournament is ready to be completed
   */
  static async isTournamentReadyForCompletion(
    tournamentId: string
  ): Promise<boolean> {
    try {
      // Get tournament with all matches
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          matches: {
            where: {
              status: { not: "CANCELLED" },
            },
            orderBy: { round: "asc" },
          },
          players: {
            where: { isActive: true },
            include: { user: true },
          },
        },
      });

      if (!tournament || tournament.status === "COMPLETED") {
        return false;
      }

      // Check if all matches are completed
      const allMatchesCompleted = tournament.matches.every(
        (match) => match.status === "COMPLETED"
      );

      // Check if we have a final winner (last match completed)
      const finalMatch = tournament.matches[tournament.matches.length - 1];
      const hasFinalWinner = Boolean(
        finalMatch && finalMatch.status === "COMPLETED" && finalMatch.winnerId
      );

      return allMatchesCompleted && hasFinalWinner;
    } catch (error) {
      logger.error("Error checking tournament completion readiness", {
        tournamentId,
        error,
      });
      return false;
    }
  }

  /**
   * Calculate final bracket results and determine winners
   */
  static async calculateTournamentResults(
    tournamentId: string
  ): Promise<TournamentWinner[]> {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          matches: {
            where: {
              status: "COMPLETED",
              result: { not: "DRAW" },
            },
            orderBy: { round: "asc" },
            include: {
              player1: { select: { id: true, username: true } },
              player2: { select: { id: true, username: true } },
            },
          },
          players: {
            where: { isActive: true },
            include: { user: true },
          },
        },
      });

      if (!tournament) {
        throw new Error("Tournament not found");
      }

      // Build bracket progression to determine final placements
      const bracketResults = this.buildBracketResults(tournament.matches);

      // Get prize breakdown
      const prizeBreakdown =
        (tournament.prizeBreakdown as unknown as PrizeBreakdown) || {
          first: roundToCents(tournament.prizePool * 0.6),
          second: roundToCents(tournament.prizePool * 0.25),
          third: roundToCents(tournament.prizePool * 0.15),
        };

      // Determine winners based on bracket results
      const winners: TournamentWinner[] = [];

      // First place (tournament winner)
      if (bracketResults.winner) {
        winners.push({
          userId: bracketResults.winner.userId,
          username: bracketResults.winner.username,
          placement: 1,
          prizeAmount: prizeBreakdown.first,
        });
      }

      // Second place (runner-up)
      if (bracketResults.runnerUp) {
        winners.push({
          userId: bracketResults.runnerUp.userId,
          username: bracketResults.runnerUp.username,
          placement: 2,
          prizeAmount: prizeBreakdown.second,
        });
      }

      // Third place (if applicable - from semifinal losers)
      if (bracketResults.thirdPlace) {
        winners.push({
          userId: bracketResults.thirdPlace.userId,
          username: bracketResults.thirdPlace.username,
          placement: 3,
          prizeAmount: prizeBreakdown.third,
        });
      }

      return winners;
    } catch (error) {
      logger.error("Error calculating tournament results", {
        tournamentId,
        error,
      });
      throw error;
    }
  }

  /**
   * Build bracket results from completed matches
   */
  private static buildBracketResults(matches: any[]): {
    winner?: { userId: string; username: string };
    runnerUp?: { userId: string; username: string };
    thirdPlace?: { userId: string; username: string };
  } {
    const results: any = {};

    // Group matches by round
    const matchesByRound = matches.reduce((acc, match) => {
      if (!acc[match.round]) acc[match.round] = [];
      acc[match.round].push(match);
      return acc;
    }, {});

    // Find the final round (highest round number)
    const finalRound = Math.max(...Object.keys(matchesByRound).map(Number));

    // Get final match
    const finalMatch = matchesByRound[finalRound]?.[0];
    if (finalMatch && finalMatch.winnerId) {
      const winner =
        finalMatch.winnerId === finalMatch.player1Id
          ? finalMatch.player1
          : finalMatch.player2;

      results.winner = {
        userId: winner.id,
        username: winner.username,
      };

      // Runner-up is the loser of the final
      const runnerUp =
        finalMatch.winnerId === finalMatch.player1Id
          ? finalMatch.player2
          : finalMatch.player1;

      results.runnerUp = {
        userId: runnerUp.id,
        username: runnerUp.username,
      };
    }

    // For third place, we need to find the semifinal losers
    // This is a simplified approach - in a real bracket system, you'd track semifinal losers
    if (finalRound > 1) {
      const semifinalMatches = matchesByRound[finalRound - 1] || [];
      const semifinalLosers = semifinalMatches
        .filter((match) => match.winnerId)
        .map((match) => {
          const loser =
            match.winnerId === match.player1Id ? match.player2 : match.player1;
          return { userId: loser.id, username: loser.username };
        })
        .filter(
          (loser) =>
            loser.userId !== results.winner?.userId &&
            loser.userId !== results.runnerUp?.userId
        );

      if (semifinalLosers.length > 0) {
        results.thirdPlace = semifinalLosers[0];
      }
    }

    return results;
  }

  /**
   * Complete tournament and distribute prizes
   */
  static async completeTournament(tournamentId: string): Promise<{
    success: boolean;
    winners: TournamentWinner[];
    message: string;
  }> {
    try {
      // Check if tournament is ready for completion
      const isReady = await this.isTournamentReadyForCompletion(tournamentId);
      if (!isReady) {
        return {
          success: false,
          winners: [],
          message: "Tournament is not ready for completion",
        };
      }

      // Calculate winners and prizes
      const winners = await this.calculateTournamentResults(tournamentId);

      if (winners.length === 0) {
        return {
          success: false,
          winners: [],
          message: "No winners determined",
        };
      }

      // Use transaction to ensure data consistency
      await prisma.$transaction(async (tx) => {
        // Update tournament status
        await tx.tournament.update({
          where: { id: tournamentId },
          data: {
            status: "COMPLETED",
            endDate: new Date(),
          },
        });

        // Update player placements and prize amounts
        for (const winner of winners) {
          await tx.tournamentPlayer.update({
            where: {
              userId_tournamentId: {
                userId: winner.userId,
                tournamentId,
              },
            },
            data: {
              placement: winner.placement,
              prizeWon: winner.prizeAmount,
              isEliminated: false,
            },
          });

          // Create prize payout payment
          await tx.payment.create({
            data: {
              userId: winner.userId,
              tournamentId,
              amount: winner.prizeAmount,
              currency: "USD",
              type: "PRIZE_PAYOUT",
              status: "COMPLETED",
              paymentConfirmedAt: new Date(),
              metadata: {
                reason: `Tournament ${
                  winner.placement === 1
                    ? "winner"
                    : winner.placement === 2
                    ? "runner-up"
                    : "third place"
                } prize`,
                placement: winner.placement,
                processedAt: new Date().toISOString(),
                automatic: true,
              },
            },
          });
        }

        // Mark all remaining players as eliminated
        await tx.tournamentPlayer.updateMany({
          where: {
            tournamentId,
            placement: null,
            isActive: true,
          },
          data: {
            isEliminated: true,
            isActive: false,
          },
        });
      });

      logger.info("Tournament completed successfully", {
        tournamentId,
        winnersCount: winners.length,
        winners: winners.map((w) => ({
          userId: w.userId,
          placement: w.placement,
          prize: w.prizeAmount,
        })),
      });

      return {
        success: true,
        winners,
        message: `Tournament completed with ${winners.length} winners`,
      };
    } catch (error) {
      logger.error("Error completing tournament", { tournamentId, error });
      throw error;
    }
  }

  /**
   * Check and complete tournaments that are ready
   * This can be called periodically or after each match completion
   */
  static async checkAndCompleteTournaments(): Promise<void> {
    try {
      // Find active tournaments
      const activeTournaments = await prisma.tournament.findMany({
        where: {
          status: "ACTIVE",
        },
        select: { id: true, title: true },
      });

      for (const tournament of activeTournaments) {
        try {
          const isReady = await this.isTournamentReadyForCompletion(
            tournament.id
          );
          if (isReady) {
            logger.info("Auto-completing tournament", {
              tournamentId: tournament.id,
              title: tournament.title,
            });
            await this.completeTournament(tournament.id);
          }
        } catch (error) {
          logger.error("Error auto-completing tournament", {
            tournamentId: tournament.id,
            error,
          });
        }
      }
    } catch (error) {
      logger.error("Error checking tournament completion", { error });
    }
  }
}
