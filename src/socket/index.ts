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

export let ioInstance: SocketServer | null = null;

export const initializeSocket = (io: SocketServer) => {
  ioInstance = io;
  // Apply authentication middleware
  io.use(authenticateSocket);

  io.on("connection", (socket: AuthenticatedSocket) => {
    logger.info("User connected via socket", {
      userId: socket.user?.id,
      username: socket.user?.username,
      socketId: socket.id,
    });

    // Join user to their personal room for notifications
    if (socket.user) {
      socket.join(`user:${socket.user.id}`);
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

        // Get match details with player info
        const matchWithPlayers = await prisma.match.findUnique({
          where: { id: matchId },
          include: {
            player1: { select: { id: true, username: true, avatar: true } },
            player2: { select: { id: true, username: true, avatar: true } },
            game: { select: { name: true } },
          },
        });

        // Send game state along with room confirmation
        const currentGameData = (matchWithPlayers as any)?.gameData;

        // Determine current turn based on game data
        let currentTurn = "white"; // Default to white starts
        if (currentGameData?.lastMoveBy) {
          // If there was a last move, alternate the turn
          if (currentGameData.lastMoveBy === matchWithPlayers?.player1Id) {
            currentTurn = "black"; // Player 1 moved, now player 2's turn
          } else {
            currentTurn = "white"; // Player 2 moved, now player 1's turn
          }
        }

        const gameState = {
          matchId,
          gameType: matchWithPlayers?.game.name.toLowerCase() || "chess",
          status: matchWithPlayers?.status.toLowerCase(),
          currentTurn,
          players: {
            white: matchWithPlayers?.player1 || {
              id: "",
              username: "",
              rating: 0,
              isOnline: true,
            },
            black: matchWithPlayers?.player2 || {
              id: "",
              username: "",
              rating: 0,
              isOnline: true,
            },
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
            select: { player1Id: true, player2Id: true },
          });

          if (!currentMatch) {
            socket.emit("error", { message: "Match not found" });
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
            case "win":
              // The user who calls this wins
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

          // Update match status
          const match = await prisma.match.update({
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

          logger.info("Game completed", {
            matchId,
            result: matchResult,
            originalReason: result,
            winnerId: match.winnerId,
            player1Id: match.player1Id,
            player2Id: match.player2Id,
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
    socket.on("disconnect", (reason) => {
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
