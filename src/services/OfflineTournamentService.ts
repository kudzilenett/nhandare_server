import { prisma } from "../config/database";
import { Tournament, TournamentPlayer, Match, User } from "@prisma/client";

export interface OfflineTournamentData {
  tournamentId: string;
  bracket: any;
  players: TournamentPlayer[];
  matches: Match[];
  rules: any;
  timeControls: any;
  lastSync: Date;
}

export interface OfflineMatchResult {
  matchId: string;
  winnerId: string;
  gameData: any;
  completedAt: Date;
  offlinePlayed: boolean;
}

export interface SyncResult {
  success: boolean;
  syncedMatches: number;
  syncedResults: number;
  conflicts: Array<{
    matchId: string;
    localResult: any;
    serverResult: any;
    resolution: "local" | "server" | "manual";
  }>;
  errors: string[];
}

export class OfflineTournamentService {
  // Cache tournament data for offline play
  // This service handles Zimbabwe's connectivity challenges

  /**
   * Cache tournament data for offline play
   */
  static async cacheTournamentForOffline(
    tournamentId: string,
    userId: string
  ): Promise<OfflineTournamentData> {
    // Get complete tournament data
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
                province: true,
                city: true,
                institution: true,
              },
            },
          },
        },
        matches: {
          include: {
            player1: { select: { id: true, username: true } },
            player2: { select: { id: true, username: true } },
          },
        },
        game: {
          select: {
            name: true,
            rules: true,
            settings: true,
          },
        },
      },
    });

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    // Check if user is a participant
    const isParticipant = tournament.players.some((p) => p.userId === userId);
    if (!isParticipant) {
      throw new Error("User is not a participant in this tournament");
    }

    // Prepare offline data
    const offlineData: OfflineTournamentData = {
      tournamentId,
      bracket: tournament.bracket,
      players: tournament.players,
      matches: tournament.matches,
      rules: tournament.game.rules,
      timeControls: tournament.game.settings,
      lastSync: new Date(),
    };

    // Store in offline cache (this would be implemented in the mobile app)
    // For now, we'll return the data structure
    console.log(
      `Caching tournament ${tournamentId} for offline play by user ${userId}`
    );

    return offlineData;
  }

  /**
   * Get offline tournament data for a user
   */
  static async getOfflineTournamentData(
    tournamentId: string,
    userId: string
  ): Promise<OfflineTournamentData | null> {
    // This would retrieve from local storage in the mobile app
    // For now, we'll simulate by checking if the tournament exists and user is participant

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        _count: { select: { players: true } },
      },
    });

    if (!tournament) {
      return null;
    }

    // Check if user is participant
    const isParticipant = await prisma.tournamentPlayer.findUnique({
      where: {
        userId_tournamentId: {
          userId,
          tournamentId,
        },
      },
    });

    if (!isParticipant) {
      return null;
    }

    // Return cached data (this would come from mobile app local storage)
    console.log(
      `Retrieving offline tournament data for ${tournamentId} and user ${userId}`
    );

    // For now, return null to indicate no cached data
    return null;
  }

  /**
   * Sync offline tournament results when connectivity is restored
   */
  static async syncOfflineResults(
    tournamentId: string,
    userId: string,
    offlineResults: OfflineMatchResult[]
  ): Promise<SyncResult> {
    const syncResult: SyncResult = {
      success: true,
      syncedMatches: 0,
      syncedResults: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // Validate tournament and user participation
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          matches: true,
          players: true,
        },
      });

      if (!tournament) {
        throw new Error("Tournament not found");
      }

      const isParticipant = tournament.players.some((p) => p.userId === userId);
      if (!isParticipant) {
        throw new Error("User is not a participant in this tournament");
      }

      // Process each offline result
      for (const offlineResult of offlineResults) {
        try {
          const singleSyncResult = await this.syncSingleMatchResult(
            tournamentId,
            offlineResult,
            tournament
          );

          if (singleSyncResult.success) {
            syncResult.syncedResults++;
          } else {
            syncResult.errors.push(
              `Failed to sync match ${offlineResult.matchId}: ${singleSyncResult.error}`
            );
          }
        } catch (error) {
          syncResult.errors.push(
            `Error syncing match ${offlineResult.matchId}: ${error}`
          );
        }
      }

      // Update tournament status if needed
      await this.updateTournamentStatusIfNeeded(tournamentId);
    } catch (error) {
      syncResult.success = false;
      syncResult.errors.push(`Sync failed: ${error}`);
    }

    return syncResult;
  }

  /**
   * Sync a single offline match result
   */
  private static async syncSingleMatchResult(
    tournamentId: string,
    offlineResult: OfflineMatchResult,
    tournament: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Find the match
      const match = tournament.matches.find(
        (m: any) => m.id === offlineResult.matchId
      );
      if (!match) {
        return { success: false, error: "Match not found" };
      }

      // Check if match is already completed on server
      if (match.status === "COMPLETED" && match.winnerId) {
        // Conflict: server already has a result
        if (match.winnerId !== offlineResult.winnerId) {
          // Different winners - this needs manual resolution
          console.warn(
            `Match ${offlineResult.matchId} has conflicting results. Server: ${match.winnerId}, Offline: ${offlineResult.winnerId}`
          );

          // For now, we'll trust the server result
          // In a real implementation, this would create a dispute for manual resolution
          return {
            success: false,
            error: "Conflicting results - manual resolution required",
          };
        }

        // Same winner, no conflict
        return { success: true };
      }

      // Update match with offline result
      await prisma.match.update({
        where: { id: offlineResult.matchId },
        data: {
          status: "COMPLETED",
          result:
            offlineResult.winnerId === match.player1Id
              ? "PLAYER1_WIN"
              : "PLAYER2_WIN",
          winnerId: offlineResult.winnerId,
          gameData: offlineResult.gameData,
          finishedAt: offlineResult.completedAt,
        },
      });

      // Update tournament player stats
      await this.updatePlayerTournamentStats(
        tournamentId,
        offlineResult.winnerId,
        match.player1Id,
        match.player2Id
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: `Database error: ${error}` };
    }
  }

  /**
   * Update player tournament statistics after match completion
   */
  private static async updatePlayerTournamentStats(
    tournamentId: string,
    winnerId: string,
    player1Id: string,
    player2Id: string
  ): Promise<void> {
    const loserId = winnerId === player1Id ? player2Id : player1Id;

    // Update winner stats
    await prisma.tournamentPlayer.update({
      where: {
        userId_tournamentId: {
          userId: winnerId,
          tournamentId,
        },
      },
      data: {
        currentRound: { increment: 1 },
      },
    });

    // Update loser stats
    await prisma.tournamentPlayer.update({
      where: {
        userId_tournamentId: {
          userId: loserId,
          tournamentId,
        },
      },
      data: {
        isEliminated: true,
      },
    });
  }

  /**
   * Update tournament status if all matches are completed
   */
  private static async updateTournamentStatusIfNeeded(
    tournamentId: string
  ): Promise<void> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        _count: { select: { matches: true } },
        matches: {
          where: { status: "COMPLETED" },
        },
      },
    });

    if (!tournament) return;

    // Check if all matches are completed
    if (tournament._count.matches === tournament.matches.length) {
      // All matches completed, update tournament status
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: "COMPLETED" },
      });

      console.log(
        `Tournament ${tournamentId} marked as completed after offline sync`
      );
    }
  }

  /**
   * Check if tournament can be played offline
   */
  static async canPlayOffline(
    tournamentId: string,
    userId: string
  ): Promise<{
    canPlay: boolean;
    reason?: string;
    requiredData?: string[];
  }> {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          players: true,
          game: true,
        },
      });

      if (!tournament) {
        return { canPlay: false, reason: "Tournament not found" };
      }

      // Check if user is participant
      const isParticipant = tournament.players.some((p) => p.userId === userId);
      if (!isParticipant) {
        return { canPlay: false, reason: "User is not a participant" };
      }

      // Check if tournament is in appropriate status
      if (!["ACTIVE", "CLOSED"].includes(tournament.status)) {
        return {
          canPlay: false,
          reason: `Tournament status is ${tournament.status}`,
        };
      }

      // Check if game supports offline play
      const supportsOffline = this.gameSupportsOffline(tournament.game.name);
      if (!supportsOffline) {
        return {
          canPlay: false,
          reason: `${tournament.game.name} does not support offline play`,
        };
      }

      return {
        canPlay: true,
        requiredData: [
          "tournament_bracket",
          "player_opponents",
          "game_rules",
          "time_controls",
        ],
      };
    } catch (error) {
      return {
        canPlay: false,
        reason: `Error checking offline capability: ${error}`,
      };
    }
  }

  /**
   * Check if a game supports offline play
   */
  private static gameSupportsOffline(gameName: string): boolean {
    // Games that can be played offline (turn-based, no real-time requirements)
    const offlineGames = ["chess", "checkers", "connect4", "tictactoe"];

    return offlineGames.includes(gameName.toLowerCase());
  }

  /**
   * Get offline play recommendations for Zimbabwe
   */
  static getOfflinePlayRecommendations(): {
    bestTimes: string[];
    connectivityTips: string[];
    syncStrategies: string[];
  } {
    return {
      bestTimes: [
        "Early morning (6-8 AM) - before load shedding",
        "Late evening (10 PM - 12 AM) - after peak hours",
        "Weekend mornings - better connectivity",
      ],
      connectivityTips: [
        "Use mobile data during off-peak hours",
        "Download tournament data when WiFi is available",
        "Sync results during stable connections",
        "Use offline mode during load shedding",
      ],
      syncStrategies: [
        "Sync immediately when connection is restored",
        "Batch sync multiple results together",
        "Verify sync success before continuing offline play",
        "Keep local backup of important results",
      ],
    };
  }

  /**
   * Get offline tournament statistics for a user
   */
  static async getOfflineTournamentStats(userId: string): Promise<{
    totalOfflineMatches: number;
    successfullySynced: number;
    pendingSync: number;
    lastOfflinePlay: Date | null;
  }> {
    // This would query the offline play history
    // For now, return placeholder data

    return {
      totalOfflineMatches: 0,
      successfullySynced: 0,
      pendingSync: 0,
      lastOfflinePlay: null,
    };
  }
}
