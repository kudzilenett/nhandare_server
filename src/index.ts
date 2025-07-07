import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import { createServer } from "http";
import { Server } from "socket.io";
import rateLimit from "express-rate-limit";

// Import environment and configuration
import { env, isProduction } from "./config/environment";
import { initializeDatabase, checkDatabaseHealth } from "./config/database";
import logger from "./config/logger";

// Import middleware
import { globalErrorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import {
  corsConfig,
  securityHeaders,
  sanitizeInput,
  logSecurityEvents,
} from "./middleware/security";

// Import routes
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import gameRoutes from "./routes/games";
import tournamentRoutes from "./routes/tournaments";
import matchRoutes from "./routes/matches";
import leaderboardRoutes from "./routes/leaderboard";
import paymentRoutes from "./routes/payments";
import zimbabweRoutes from "./routes/zimbabwe";
import matchmakingRoutes from "./routes/matchmaking";

// Import socket handlers
import { initializeSocket } from "./socket";

// Create Express app
const app = express();
const server = createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: env.SOCKET_CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Attach Socket.io instance to Express app for route access
app.set("io", io);

// Trust proxy for accurate IP addresses
app.set("trust proxy", isProduction ? 1 : false);

// Global rate limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || "unknown";
  },
});

// Security middleware
app.use(securityHeaders);
app.use(compression());
app.use(sanitizeInput);
app.use(logSecurityEvents);

// CORS configuration
app.use(cors(corsConfig));

// Logging middleware
app.use(morgan(isProduction ? "combined" : "dev"));

// Rate limiting
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint with detailed status
app.get("/health", async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();

    const healthStatus = {
      status: dbHealth.status === "healthy" ? "OK" : "ERROR",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      version: process.env.npm_package_version || "unknown",
      database: {
        status: dbHealth.status,
        latency: dbHealth.latency,
        ...(dbHealth.error && { error: dbHealth.error }),
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };

    const statusCode = dbHealth.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error("Health check failed", { error });
    res.status(503).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      message: "Health check failed",
    });
  }
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/games", matchmakingRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/zimbabwe", zimbabweRoutes);

// Initialize socket handlers
initializeSocket(io);

// 404 handler (must be after all routes)
app.use(notFound);

// Global error handler (must be last)
app.use(globalErrorHandler);

// Graceful shutdown handlers
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  try {
    // Close server first
    server.close(() => {
      logger.info("HTTP server closed");
    });

    // Close socket.io connections
    io.close(() => {
      logger.info("Socket.io server closed");
    });

    // Disconnect from database
    const { disconnectDatabase } = await import("./config/database");
    await disconnectDatabase();

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown", { error });
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Unhandled promise rejection handler
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", { promise, reason });
  gracefulShutdown("UNHANDLED_REJECTION");
});

// Uncaught exception handler
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", { error });
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

// Start server
async function startServer() {
  try {
    // Initialize database connection
    await initializeDatabase();

    // Start HTTP server
    server.listen(env.PORT, () => {
      logger.info("🚀 Server started successfully", {
        port: env.PORT,
        environment: env.NODE_ENV,
        nodeVersion: process.version,
      });

      if (!isProduction) {
        console.log(`🎮 Gaming Platform API is ready!`);
        console.log(`🔗 Health check: http://localhost:${env.PORT}/health`);
        console.log(`📚 API endpoints:`);
        console.log(`   POST http://localhost:${env.PORT}/api/auth/register`);
        console.log(`   POST http://localhost:${env.PORT}/api/auth/login`);
        console.log(`   GET  http://localhost:${env.PORT}/api/users`);
        console.log(`   GET  http://localhost:${env.PORT}/api/games`);
        console.log(`   GET  http://localhost:${env.PORT}/api/tournaments`);
        console.log(`   GET  http://localhost:${env.PORT}/api/leaderboard`);
      }
    });
  } catch (error) {
    logger.error("❌ Failed to start server", { error });
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for testing
export { app, io, server };
