import { PrismaClient, TournamentStatus } from "@prisma/client";
import logger from "../config/logger";
import EventBus from "../utils/EventBus";

const prisma = new PrismaClient();

export class TournamentStatusService {
  /**
   * Auto-transition tournaments based on dates
   * Runs every minute via background job
   */
  static async checkStatusTransitions(): Promise<void> {
    const now = new Date();

    try {
      // OPEN → CLOSED (registration ended)
      const closedCount = await prisma.tournament.updateMany({
        where: {
          status: "OPEN",
          registrationEnd: { lte: now },
        },
        data: { status: "CLOSED" },
      });

      if (closedCount.count > 0) {
        logger.info(
          `TournamentStatusService: Closed ${closedCount.count} tournaments`
        );
      }

      // Check for tournaments starting soon (1 hour before start)
      const startingSoonTournaments = await prisma.tournament.findMany({
        where: {
          status: "CLOSED",
          startDate: {
            gte: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
            lte: new Date(Date.now() + 61 * 60 * 1000), // 1 hour + 1 minute
          },
          currentPlayers: { gte: 2 }, // Minimum players required
        },
      });

      // Emit starting soon events
      for (const tournament of startingSoonTournaments) {
        EventBus.emitTournamentEvent("tournament:starting_soon", {
          tournamentId: tournament.id,
          tournamentName: tournament.title,
          startDate: tournament.startDate,
          currentPlayers: tournament.currentPlayers,
        });
      }

      // CLOSED → ACTIVE (tournament start time)
      const readyTournaments = await prisma.tournament.findMany({
        where: {
          status: "CLOSED",
          startDate: { lte: now },
          currentPlayers: { gte: 2 }, // Minimum players required
        },
      });

      for (const tournament of readyTournaments) {
        await this.startTournament(tournament.id);
      }

      // ACTIVE → COMPLETED (tournament end time passed)
      const completedCount = await prisma.tournament.updateMany({
        where: {
          status: "ACTIVE",
          endDate: { lte: now },
        },
        data: { status: "COMPLETED" },
      });

      if (completedCount.count > 0) {
        logger.info(
          `TournamentStatusService: Completed ${completedCount.count} tournaments`
        );
      }
    } catch (error) {
      logger.error(
        "TournamentStatusService: Error checking status transitions",
        { error }
      );
    }
  }

  /**
   * Start a tournament by generating bracket and creating matches
   */
  static async startTournament(tournamentId: string): Promise<void> {
    try {
      logger.info(
        `TournamentStatusService: Starting tournament ${tournamentId}`
      );

      // First, verify the tournament exists and has the required data
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
          players: {
            include: {
              user: true,
            },
          },
          game: true,
        },
      });

      if (!tournament) {
        throw new Error(`Tournament ${tournamentId} not found`);
      }

      if (!tournament.game) {
        throw new Error(`Tournament ${tournamentId} has no associated game`);
      }

      if (tournament.status !== "CLOSED") {
        throw new Error(
          `Tournament ${tournamentId} is not in CLOSED status, current status: ${tournament.status}`
        );
      }

      if (tournament.players.length < 2) {
        throw new Error(
          `Tournament ${tournamentId} needs at least 2 players, got ${tournament.players.length}`
        );
      }

      // Check if players have valid user data
      const validPlayers = tournament.players.filter((player) => player.user);
      if (validPlayers.length < 2) {
        throw new Error(
          `Tournament ${tournamentId} needs at least 2 valid players, got ${validPlayers.length} valid out of ${tournament.players.length} total`
        );
      }

      logger.info(
        `Tournament validation passed: ${validPlayers.length} valid players, game: ${tournament.game.name}`
      );

      // Generate bracket and create matches
      const { BracketGenerationService } = await import(
        "./BracketGenerationService"
      );
      const bracket = await BracketGenerationService.generateBracket(
        tournamentId
      );

      // Create first round matches
      const { TournamentMatchService } = await import(
        "./TournamentMatchService"
      );
      await TournamentMatchService.createTournamentMatches(
        tournamentId,
        bracket
      );

      // Update status to ACTIVE
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: "ACTIVE" },
      });

      // Emit tournament started event
      EventBus.emitTournamentEvent("tournament:started", {
        tournamentId,
        tournamentName: tournament.title,
        startDate: tournament.startDate,
        currentPlayers: tournament.currentPlayers,
      });

      // Note: Notification cleanup is handled by the frontend service
      // when it receives the tournament:started event

      // Notify players via WebSocket
      await this.notifyTournamentStart(tournamentId);

      logger.info(
        `TournamentStatusService: Tournament ${tournamentId} started successfully with bracket`
      );
    } catch (error) {
      logger.error(
        `TournamentStatusService: Failed to start tournament ${tournamentId}`,
        { error }
      );
      // Re-throw the error to prevent silent failures
      throw error;
    }
  }

  /**
   * Notify players that tournament has started
   */
  private static async notifyTournamentStart(
    tournamentId: string
  ): Promise<void> {
    try {
      const { ioInstance } = await import("../socket");

      if (ioInstance) {
        // Get all players in the tournament
        const players = await prisma.tournamentPlayer.findMany({
          where: { tournamentId },
          include: { user: true },
        });

        // Notify each player
        for (const player of players) {
          ioInstance.to(`user:${player.userId}`).emit("tournament:started", {
            tournamentId,
            message: "Tournament has started! Check your bracket and matches.",
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logger.error(
        `TournamentStatusService: Failed to notify tournament start for ${tournamentId}`,
        { error }
      );
    }
  }

  /**
   * Get tournaments that need status transitions
   */
  static async getTournamentsNeedingTransitions(): Promise<{
    openToClose: number;
    closedToActive: number;
    activeToCompleted: number;
  }> {
    const now = new Date();

    const [openToClose, closedToActive, activeToCompleted] = await Promise.all([
      prisma.tournament.count({
        where: {
          status: "OPEN",
          registrationEnd: { lte: now },
        },
      }),
      prisma.tournament.count({
        where: {
          status: "CLOSED",
          startDate: { lte: now },
          currentPlayers: { gte: 2 },
        },
      }),
      prisma.tournament.count({
        where: {
          status: "ACTIVE",
          endDate: { lte: now },
        },
      }),
    ]);

    return { openToClose, closedToActive, activeToCompleted };
  }
}
