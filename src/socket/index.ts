import { Server as SocketServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/environment";
import logger, { logSecurity } from "../config/logger";
import { prisma } from "../config/database";

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

export const initializeSocket = (io: SocketServer) => {
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

        socket.emit("joined-game-room", { matchId, gameRoom });
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
          const { matchId, move, gameState } = data;

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

          // Update match with new move
          const updatedMatch = await prisma.match.update({
            where: { id: matchId },
            data: {
              gameData: {
                ...(match.gameData as any),
                lastMove: move,
                gameState,
                lastMoveBy: socket.user.id,
                lastMoveAt: new Date().toISOString(),
              },
            },
          });

          // Broadcast move to other players in the room
          if (socket.gameRoom) {
            socket.to(socket.gameRoom).emit("move-made", {
              matchId,
              move,
              gameState,
              playerId: socket.user.id,
              timestamp: new Date().toISOString(),
            });
          }

          logger.info("Game move made", {
            userId: socket.user.id,
            matchId,
            move: JSON.stringify(move),
          });

          socket.emit("move-confirmed", { matchId, move });
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

          // Update match status
          const match = await prisma.match.update({
            where: { id: matchId },
            data: {
              status: "COMPLETED",
              result: result as any,
              gameData,
              finishedAt: new Date(),
              duration: gameData?.duration || null,
              winnerId:
                result === "WIN"
                  ? socket.user.id
                  : result === "LOSS"
                  ? (
                      await prisma.match.findUnique({
                        where: { id: matchId },
                        select: { player1Id: true, player2Id: true },
                      })
                    )?.player1Id === socket.user.id
                    ? (
                        await prisma.match.findUnique({
                          where: { id: matchId },
                          select: { player2Id: true },
                        })
                      )?.player2Id
                    : (
                        await prisma.match.findUnique({
                          where: { id: matchId },
                          select: { player1Id: true },
                        })
                      )?.player1Id
                  : null,
            },
            include: {
              player1: { select: { id: true, username: true } },
              player2: { select: { id: true, username: true } },
              game: { select: { name: true } },
            },
          });

          // Broadcast game completion to all players
          if (socket.gameRoom) {
            io.to(socket.gameRoom).emit("game-completed", {
              matchId,
              result,
              winner: match.winnerId,
              match: {
                id: match.id,
                player1: match.player1,
                player2: match.player2,
                game: match.game,
                duration: match.duration,
                finishedAt: match.finishedAt,
              },
            });
          }

          logger.info("Game completed", {
            matchId,
            result,
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
        const msg = {
          id: Date.now().toString(36) + Math.random().toString(36).substring(2),
          userId: socket.user?.id,
          username: socket.user?.username,
          text: text.trim(),
          timestamp: Date.now(),
        };
        io.to(`tournamentChat:${tournamentId}`).emit("tournament:chat", msg);
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
