import { Server as SocketServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Chess } from "chess.js";
import { env } from "../config/environment";
import logger, { logSecurity } from "../config/logger";
import { prisma } from "../config/database";
import { updatePlayerStatistics } from "../routes/matches";

interface SocketUser {
  id: string;
  username: string;
  email: string;
}

interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
  gameRoom?: string;
  matchId?: string;
}

// Helper function to validate chess moves
const validateChessMove = (
  currentFen: string | null,
  move: any
): { isValid: boolean; newFen?: string; error?: string } => {
  try {
    // Use provided FEN or start position
    const game = new Chess(currentFen || undefined);

    // Validate the move
    const chessmove = game.move(move);

    if (chessmove) {
      return {
        isValid: true,
        newFen: game.fen(),
      };
    } else {
      return {
        isValid: false,
        error: `Invalid move: ${JSON.stringify(move)}`,
      };
    }
  } catch (error) {
    return {
      isValid: false,
      error: `Move validation error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
};

// Socket authentication middleware
const authenticateSocket = async (socket: any, next: any) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    // Verify user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      logSecurity("Socket authentication failed - user not found or inactive", {
        userId: decoded.id,
        socketId: socket.id,
        ip: socket.handshake.address,
      });
      return next(new Error("User not found or inactive"));
    }

    socket.user = user;

    logger.info("Socket authenticated", {
      userId: user.id,
      username: user.username,
      socketId: socket.id,
    });

    next();
  } catch (error) {
    logSecurity("Socket authentication error", {
      error: error instanceof Error ? error.message : "Unknown error",
      socketId: socket.id,
      ip: socket.handshake.address,
    });
    next(new Error("Authentication failed"));
  }
};

/**
 * Clean up stale presence sessions that might be left over from server restarts
 */
const cleanupStalePresenceSessions = async () => {
  try {
    // Remove all CASUAL presence sessions older than 5 minutes
    // This handles cases where the server crashed and disconnect handlers didn't run
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const result = await prisma.gameSession.updateMany({
      where: {
        sessionType: "CASUAL",
        matchId: null,
        isActive: true,
        createdAt: {
          lt: fiveMinutesAgo,
        },
      },
      data: {
        isActive: false,
      },
    });

    if (result.count > 0) {
      logger.info("Cleaned up stale presence sessions on startup", {
        count: result.count,
      });
    }
  } catch (error) {
    logger.error("Failed to clean up stale presence sessions", { error });
  }
};

export let ioInstance: SocketServer | null = null;

export const initializeSocket = (io: SocketServer) => {
  ioInstance = io;

  // Clean up any stale presence sessions on server startup
  cleanupStalePresenceSessions();

  // Set up periodic cleanup every 5 minutes
  setInterval(cleanupStalePresenceSessions, 5 * 60 * 1000);

  // Apply authentication middleware
  io.use(authenticateSocket);

  io.on("connection", async (socket: AuthenticatedSocket) => {
    logger.info("User connected via socket", {
      userId: socket.user?.id,
      username: socket.user?.username,
      socketId: socket.id,
    });

    // Join user to their personal room for notifications
    if (socket.user) {
      socket.join(`user:${socket.user.id}`);

      // Create or update general presence GameSession
      try {
        // Get the first active game for presence tracking (default to chess)
        const defaultGame = await prisma.game.findFirst({
          where: { isActive: true },
          select: { id: true, name: true },
        });

        if (defaultGame) {
          // Use transaction to handle race conditions
          await prisma.$transaction(async (tx) => {
            // First, deactivate any existing presence sessions for this user
            await tx.gameSession.updateMany({
              where: {
                userId: socket.user.id,
                isActive: true,
                sessionType: "CASUAL",
                matchId: null,
              },
              data: { isActive: false },
            });

            // Create new presence session
            await tx.gameSession.create({
              data: {
                userId: socket.user.id,
                gameId: defaultGame.id,
                sessionType: "CASUAL",
                isActive: true,
                matchId: null, // General presence, not tied to specific match
              },
            });

            logger.info("Created/updated presence session for user", {
              userId: socket.user.id,
              username: socket.user.username,
              gameId: defaultGame.id,
            });
          });
        }
      } catch (error) {
        logger.error("Failed to create/update presence session", {
          error,
          userId: socket.user.id,
        });
      }
    }

    // Handle game room joining
    socket.on("join-game-room", async (data: { matchId: string }) => {
      try {
        const { matchId } = data;

        if (!socket.user) return;

        // Verify user is part of this match
        const match = await prisma.match.findUnique({
          where: { id: matchId },
          select: {
            id: true,
            player1Id: true,
            player2Id: true,
            status: true,
            gameId: true,
          },
        });

        if (!match) {
          socket.emit("error", { message: "Match not found" });
          return;
        }

        if (
          match.player1Id !== socket.user.id &&
          match.player2Id !== socket.user.id
        ) {
          socket.emit("error", { message: "You are not part of this match" });
          return;
        }

        const gameRoom = `match:${matchId}`;
        socket.join(gameRoom);
        socket.gameRoom = gameRoom;
        socket.matchId = matchId;

        logger.info("User joined game room", {
          userId: socket.user.id,
          matchId,
          gameRoom,
        });

        // Notify other players in the room
        socket.to(gameRoom).emit("player-joined", {
          userId: socket.user.id,
          username: socket.user.username,
        });

        // Get match details with player info and game statistics
        const matchWithPlayers = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            player1: {
              select: {
                id: true,
                username: true,
                avatar: true,
                points: true,
              },
            },
            player2: {
              select: {
                id: true,
                username: true,
                avatar: true,
                points: true,
              },
            },
            game: { select: { id: true, name: true } },
          },
        });

        // Get game-specific ratings for both players
        const [player1GameStats, player2GameStats] = await Promise.all([
          prisma.gameStatistic.findUnique({
            where: {
              userId_gameId: {
                userId: match.player1Id,
                gameId: match.gameId,
              },
            },
            select: { currentRating: true },
          }),
          prisma.gameStatistic.findUnique({
            where: {
              userId_gameId: {
                userId: match.player2Id,
                gameId: match.gameId,
              },
            },
            select: { currentRating: true },
          }),
        ]);

        // Send game state along with room confirmation
        const currentGameData = (matchWithPlayers as any)?.gameData;

        // Determine current turn based on game data
        let currentTurn = "white";
        if (currentGameData?.lastMoveBy) {
          // If there was a last move, alternate the turn
          if (currentGameData.lastMoveBy === matchWithPlayers?.player1Id) {
            currentTurn = "black"; // Player 1 moved, now player 2's turn
          } else {
            currentTurn = "white"; // Player 2 moved, now player 1's turn
          }
        }

        // Create proper player objects with real rating data
        const player1Data = {
          id: matchWithPlayers?.player1?.id || "",
          username: matchWithPlayers?.player1?.username || "",
          avatar: matchWithPlayers?.player1?.avatar,
          rating: player1GameStats?.currentRating || 1200, // Use game-specific rating
          isOnline: true,
        };

        const player2Data = {
          id: matchWithPlayers?.player2?.id || "",
          username: matchWithPlayers?.player2?.username || "",
          avatar: matchWithPlayers?.player2?.avatar,
          rating: player2GameStats?.currentRating || 1200, // Use game-specific rating
          isOnline: true,
        };

        const gameState = {
          matchId,
          gameType: matchWithPlayers?.game.name.toLowerCase() || "chess",
          status: matchWithPlayers?.status.toLowerCase(),
          currentTurn,
          players: {
            white: player1Data, // Player1 plays as white
            black: player2Data, // Player2 plays as black
          },
          gameData: currentGameData || null,
          timeRemaining: { white: 600, black: 600 }, // TODO: Get from match
          moveHistory: [],
        };

        socket.emit("joined-game-room", { matchId, gameRoom, gameState });
      } catch (error) {
        logger.error("Error joining game room", {
          error,
          userId: socket.user?.id,
        });
        socket.emit("error", { message: "Failed to join game room" });
      }
    });

    // Handle game moves
    socket.on(
      "make-move",
      async (data: { matchId: string; move: any; gameState: any }) => {
        try {
          const { matchId, move } = data;

          if (!socket.user || socket.matchId !== matchId) {
            socket.emit("error", {
              message: "Invalid match or not joined to match",
            });
            return;
          }

          // Verify it's the user's turn and validate move
          const match = await prisma.match.findUnique({
            where: { id: matchId },
            select: {
              id: true,
              player1Id: true,
              player2Id: true,
              status: true,
              gameData: true,
            },
          });

          if (!match || match.status !== "ACTIVE") {
            socket.emit("error", { message: "Match not active" });
            return;
          }

          // Basic turn validation (improve this based on your game rules)
          const currentGameData = match.gameData as any;
          const lastMoveBy = currentGameData?.lastMoveBy;

          // If there's a last move, the current player should be different
          if (lastMoveBy && lastMoveBy === socket.user.id) {
            socket.emit("error", { message: "Not your turn" });
            return;
          }

          // Validate the chess move
          const currentFen = currentGameData?.fen || null;
          const validation = validateChessMove(currentFen, move);

          if (!validation.isValid) {
            socket.emit("error", {
              message: validation.error || "Invalid move",
            });
            return;
          }

          // Update match with new move
          const updatedMatch = await prisma.match.update({
            where: { id: matchId },
            data: {
              gameData: {
                ...(match.gameData as any),
                lastMove: move,
                lastMoveBy: socket.user.id,
                lastMoveAt: new Date().toISOString(),
                fen: validation.newFen, // Store the new FEN position
              },
            },
          });

          // Broadcast move to other players in the room
          if (socket.gameRoom) {
            socket.to(socket.gameRoom).emit("move-made", {
              matchId,
              move,
              gameState: updatedMatch.gameData,
              playerId: socket.user.id,
              timestamp: new Date().toISOString(),
            });
          }

          logger.info("Game move made", {
            userId: socket.user.id,
            matchId,
            move: JSON.stringify(move),
          });

          // Confirm move to the player who made it with updated game state
          socket.emit("move-confirmed", {
            matchId,
            move,
            gameState: updatedMatch.gameData,
          });
        } catch (error) {
          logger.error("Error making move", { error, userId: socket.user?.id });
          socket.emit("error", { message: "Failed to make move" });
        }
      }
    );

    // Handle game completion
    socket.on(
      "complete-game",
      async (data: { matchId: string; result: string; gameData: any }) => {
        try {
          const { matchId, result, gameData } = data;

          if (!socket.user || socket.matchId !== matchId) {
            socket.emit("error", {
              message: "Invalid match or not joined to match",
            });
            return;
          }

          // Get match details first to determine winner
          const currentMatch = await prisma.match.findUnique({
            where: { id: matchId },
            select: {
              player1Id: true,
              player2Id: true,
              status: true,
              gameData: true,
            },
          });

          if (!currentMatch) {
            socket.emit("error", { message: "Match not found" });
            return;
          }

          // Prevent duplicate game completion using transaction for race condition safety
          if (currentMatch.status !== "ACTIVE") {
            logger.info(
              "Game already completed, ignoring duplicate completion",
              {
                matchId,
                userId: socket.user.id,
                currentStatus: currentMatch.status,
              }
            );
            return;
          }

          // Use transaction to prevent race conditions
          await prisma.$transaction(async (tx) => {
            // Double-check status within transaction
            const matchCheck = await tx.match.findUnique({
              where: { id: matchId },
              select: { status: true },
            });

            if (!matchCheck || matchCheck.status !== "ACTIVE") {
              logger.info(
                "Game completion race condition detected - already completed",
                {
                  matchId,
                  userId: socket.user.id,
                }
              );
              return;
            }

            // Map result to correct enum values and determine winner
            let matchResult: string;
            let winnerId: string | null = null;

            switch (result) {
              case "resignation":
              case "forfeit":
                matchResult = "FORFEIT";
                // The user who resigned loses, opponent wins
                winnerId =
                  currentMatch.player1Id === socket.user.id
                    ? currentMatch.player2Id
                    : currentMatch.player1Id;
                break;
              case "draw":
                matchResult = "DRAW";
                winnerId = null;
                break;
              case "checkmate":
                // For checkmate, always validate using chess position to determine the real winner
                // Don't trust the caller's perspective - validate the actual position
                if (gameData?.fen) {
                  try {
                    const chess = new Chess(gameData.fen);
                    if (chess.isCheckmate()) {
                      // In checkmate, the player whose turn it is loses
                      const currentTurn = chess.turn(); // 'w' for white, 'b' for black
                      const whiteInCheckmate = currentTurn === "w";

                      // Player1 is white, Player2 is black
                      if (whiteInCheckmate) {
                        // White (player1) is in checkmate, so player2 wins
                        matchResult = "PLAYER2_WIN";
                        winnerId = currentMatch.player2Id;
                      } else {
                        // Black (player2) is in checkmate, so player1 wins
                        matchResult = "PLAYER1_WIN";
                        winnerId = currentMatch.player1Id;
                      }

                      logger.info("Checkmate winner determined from FEN", {
                        fen: gameData.fen,
                        currentTurn,
                        whiteInCheckmate,
                        winnerId,
                        matchResult,
                        reportedBy: socket.user.id,
                      });
                    } else {
                      // Position is not actually checkmate - invalid
                      logger.warn(
                        "Checkmate claimed but position is not checkmate",
                        {
                          fen: gameData.fen,
                          matchId,
                          reportedBy: socket.user.id,
                        }
                      );
                      socket.emit("error", {
                        message:
                          "Invalid checkmate claim - position is not checkmate",
                      });
                      return;
                    }
                  } catch (error) {
                    logger.error("Error validating checkmate position", {
                      error,
                      fen: gameData.fen,
                      matchId,
                      reportedBy: socket.user.id,
                    });
                    socket.emit("error", {
                      message: "Invalid chess position provided",
                    });
                    return;
                  }
                } else {
                  // No FEN provided for checkmate claim - reject
                  logger.warn("Checkmate claimed but no FEN provided", {
                    matchId,
                    reportedBy: socket.user.id,
                  });
                  socket.emit("error", {
                    message: "Chess position required for checkmate claim",
                  });
                  return;
                }
                break;
              case "win":
                // Direct win claim (not checkmate)
                matchResult =
                  currentMatch.player1Id === socket.user.id
                    ? "PLAYER1_WIN"
                    : "PLAYER2_WIN";
                winnerId = socket.user.id;
                break;
              case "timeout":
                // The user who timed out loses
                matchResult = "FORFEIT";
                winnerId =
                  currentMatch.player1Id === socket.user.id
                    ? currentMatch.player2Id
                    : currentMatch.player1Id;
                break;
              default:
                matchResult = "FORFEIT";
                winnerId =
                  currentMatch.player1Id === socket.user.id
                    ? currentMatch.player2Id
                    : currentMatch.player1Id;
            }

            // Update match status within transaction
            const match = await tx.match.update({
              where: { id: matchId },
              data: {
                status: "COMPLETED",
                result: matchResult as any,
                gameData,
                finishedAt: new Date(),
                duration: gameData?.duration || null,
                winnerId,
              },
              include: {
                player1: { select: { id: true, username: true } },
                player2: { select: { id: true, username: true } },
                game: { select: { name: true } },
              },
            });

            // Update player statistics and get rating changes
            const ratingChanges = await updatePlayerStatistics(
              match,
              matchResult,
              winnerId
            );

            // Check if tournament should be completed after this match
            if (match.tournamentId) {
              try {
                const { TournamentCompletionService } = await import(
                  "../services/TournamentCompletionService"
                );
                const isReady =
                  await TournamentCompletionService.isTournamentReadyForCompletion(
                    match.tournamentId
                  );
                if (isReady) {
                  logger.info("Tournament ready for completion after match", {
                    tournamentId: match.tournamentId,
                    matchId: match.id,
                  });

                  // Complete tournament asynchronously to avoid blocking the match completion
                  TournamentCompletionService.completeTournament(
                    match.tournamentId
                  )
                    .then((result) => {
                      if (result.success) {
                        logger.info("Tournament auto-completed", {
                          tournamentId: match.tournamentId,
                          winners: result.winners,
                        });

                        // Emit tournament completion event
                        io.emit("tournament:completed", {
                          tournamentId: match.tournamentId,
                          winners: result.winners,
                        });
                      }
                    })
                    .catch((error) => {
                      logger.error("Error auto-completing tournament", {
                        tournamentId: match.tournamentId,
                        error,
                      });
                    });
                }
              } catch (error) {
                logger.error("Error checking tournament completion", {
                  tournamentId: match.tournamentId,
                  error,
                });
              }
            }

            // Broadcast game completion to all players
            if (socket.gameRoom) {
              io.to(socket.gameRoom).emit("game-completed", {
                matchId,
                result: matchResult,
                reason: result, // Send original reason for UI display
                winner: match.winnerId,
                actionBy: socket.user.id, // WHO triggered this action (resigned, etc.)
                match: {
                  id: match.id,
                  player1: match.player1,
                  player2: match.player2,
                  game: match.game,
                  duration: match.duration,
                  finishedAt: match.finishedAt,
                },
                ratingChanges: ratingChanges
                  ? {
                      player1: {
                        id: match.player1Id,
                        change: ratingChanges.player1RatingChange,
                        newRating: ratingChanges.player1NewRating,
                      },
                      player2: {
                        id: match.player2Id,
                        change: ratingChanges.player2RatingChange,
                        newRating: ratingChanges.player2NewRating,
                      },
                    }
                  : null,
              });
            }

            // Transition players back to general presence after game completion
            try {
              // Deactivate their in-game sessions
              await tx.gameSession.updateMany({
                where: {
                  matchId: matchId,
                  isActive: true,
                },
                data: { isActive: false },
              });

              // Get the default game for presence tracking
              const defaultGame = await tx.game.findFirst({
                where: { isActive: true },
                select: { id: true },
              });

              if (defaultGame) {
                // Create new general presence sessions for both players
                await Promise.all([
                  tx.gameSession.create({
                    data: {
                      userId: match.player1Id,
                      gameId: defaultGame.id,
                      sessionType: "CASUAL",
                      isActive: true,
                      matchId: null,
                    },
                  }),
                  tx.gameSession.create({
                    data: {
                      userId: match.player2Id,
                      gameId: defaultGame.id,
                      sessionType: "CASUAL",
                      isActive: true,
                      matchId: null,
                    },
                  }),
                ]);

                logger.info("Players transitioned back to general presence", {
                  matchId,
                  player1Id: match.player1Id,
                  player2Id: match.player2Id,
                });
              }
            } catch (error) {
              logger.error("Failed to transition players back to presence", {
                error,
                matchId,
              });
            }

            logger.info("Game completed", {
              matchId,
              result: matchResult,
              originalReason: result,
              winnerId: match.winnerId,
              player1Id: match.player1Id,
              player2Id: match.player2Id,
              reportedBy: socket.user.id,
            });
          });
        } catch (error) {
          logger.error("Error completing game", {
            error,
            userId: socket.user?.id,
          });
          socket.emit("error", { message: "Failed to complete game" });
        }
      }
    );

    // Handle draw offers
    socket.on("offer-draw", async (data: { matchId: string }) => {
      try {
        const { matchId } = data;

        if (!socket.user || socket.matchId !== matchId) {
          socket.emit("error", {
            message: "Invalid match or not joined to match",
          });
          return;
        }

        // Broadcast draw offer to opponent
        if (socket.gameRoom) {
          socket.to(socket.gameRoom).emit("draw-offered", {
            matchId,
            offeredBy: socket.user.id,
            username: socket.user.username,
          });
        }

        logger.info("Draw offered", {
          userId: socket.user.id,
          matchId,
        });
      } catch (error) {
        logger.error("Error offering draw", {
          error,
          userId: socket.user?.id,
        });
        socket.emit("error", { message: "Failed to offer draw" });
      }
    });

    // Handle chat messages
    socket.on("send-message", (data: { matchId: string; message: string }) => {
      try {
        const { matchId, message } = data;

        if (!socket.user || socket.matchId !== matchId) {
          socket.emit("error", {
            message: "Invalid match or not joined to match",
          });
          return;
        }

        if (!message || message.trim().length === 0) {
          socket.emit("error", { message: "Message cannot be empty" });
          return;
        }

        if (message.length > 500) {
          socket.emit("error", { message: "Message too long" });
          return;
        }

        // Broadcast message to game room
        if (socket.gameRoom) {
          io.to(socket.gameRoom).emit("message-received", {
            matchId,
            message: message.trim(),
            playerId: socket.user.id,
            playerUsername: socket.user.username,
            timestamp: new Date().toISOString(),
          });
        }

        logger.info("Chat message sent", {
          userId: socket.user.id,
          matchId,
          messageLength: message.length,
        });
      } catch (error) {
        logger.error("Error sending message", {
          error,
          userId: socket.user?.id,
        });
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Handle leaving game room
    socket.on("leave-game-room", () => {
      try {
        if (socket.gameRoom) {
          socket.to(socket.gameRoom).emit("player-left", {
            userId: socket.user?.id,
            username: socket.user?.username,
          });

          socket.leave(socket.gameRoom);

          logger.info("User left game room", {
            userId: socket.user?.id,
            gameRoom: socket.gameRoom,
          });

          socket.gameRoom = undefined;
          socket.matchId = undefined;
        }
      } catch (error) {
        logger.error("Error leaving game room", {
          error,
          userId: socket.user?.id,
        });
      }
    });

    // Handle tournament updates
    socket.on("join-tournament-room", (data: { tournamentId: string }) => {
      try {
        const { tournamentId } = data;
        const tournamentRoom = `tournament:${tournamentId}`;

        socket.join(tournamentRoom);

        logger.info("User joined tournament room", {
          userId: socket.user?.id,
          tournamentId,
        });

        socket.emit("joined-tournament-room", { tournamentId });
      } catch (error) {
        logger.error("Error joining tournament room", {
          error,
          userId: socket.user?.id,
        });
        socket.emit("error", { message: "Failed to join tournament room" });
      }
    });

    // Handle tournament chat joining
    socket.on("join-tournament-chat", ({ tournamentId }) => {
      try {
        const room = `tournamentChat:${tournamentId}`;
        socket.join(room);
        socket.emit("joined-tournament-chat", { tournamentId });
      } catch (err) {
        logger.error("join-tournament-chat error", err);
      }
    });

    socket.on("leave-tournament-chat", ({ tournamentId }) => {
      try {
        socket.leave(`tournamentChat:${tournamentId}`);
      } catch (err) {
        logger.error("leave-tournament-chat error", err);
      }
    });

    socket.on("tournament:chat", async ({ tournamentId, text }) => {
      try {
        if (!text || !text.trim()) return;
        const cleanText = text.trim().slice(0, 500);
        const msg = {
          id: Date.now().toString(36) + Math.random().toString(36).substring(2),
          userId: socket.user?.id,
          username: socket.user?.username,
          text: cleanText,
          timestamp: Date.now(),
        };
        io.to(`tournamentChat:${tournamentId}`).emit("tournament:chat", msg);

        // Persist message to database (fire-and-forget)
        const { prisma } = await import("../config/database");
        // @ts-ignore – generated after Prisma schema update
        await prisma.tournamentChatMessage.create({
          data: {
            id: msg.id,
            tournamentId,
            userId: socket.user?.id!,
            text: cleanText,
            createdAt: new Date(msg.timestamp),
          },
        });
      } catch (err) {
        logger.error("tournament chat error", err);
      }
    });

    // Handle disconnection
    socket.on("disconnect", async (reason) => {
      logger.info("User disconnected from socket", {
        userId: socket.user?.id,
        username: socket.user?.username,
        socketId: socket.id,
        reason,
      });

      // Notify game room if user was in a match
      if (socket.gameRoom && socket.user) {
        socket.to(socket.gameRoom).emit("player-disconnected", {
          userId: socket.user.id,
          username: socket.user.username,
          reason,
        });
      }

      // Clean up ALL active sessions for this user on disconnect
      if (socket.user) {
        try {
          await prisma.$transaction(async (tx) => {
            // Clean up general presence sessions
            await tx.gameSession.updateMany({
              where: {
                userId: socket.user.id,
                isActive: true,
                sessionType: "CASUAL",
                matchId: null,
              },
              data: { isActive: false },
            });

            // Don't clean up in-game sessions - those should persist even if socket disconnects temporarily
            // Only clean casual presence sessions
          });

          logger.info("Cleaned up presence sessions for user", {
            userId: socket.user.id,
          });
        } catch (error) {
          logger.error("Failed to clean up presence sessions on disconnect", {
            error,
            userId: socket.user.id,
          });
        }
      }
    });

    // Handle errors
    socket.on("error", (error) => {
      logger.error("Socket error", {
        error,
        userId: socket.user?.id,
        socketId: socket.id,
      });
    });
  });

  // Handle connection errors
  io.on("connect_error", (error) => {
    logger.error("Socket connection error", { error });
  });

  logger.info("Socket.io server initialized");
};
