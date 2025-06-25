import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Load environment variables
dotenv.config();

// Initialize Prisma
const prisma = new PrismaClient();

// Create Express app
const app = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:8081",
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// Test database connection endpoint
app.get("/api/games", async (req, res) => {
  try {
    const games = await prisma.game.findMany();
    res.json({
      success: true,
      data: games,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Test user registration endpoint
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, username, password, location } = req.body;

    if (!email || !username || !password || !location) {
      res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
      return;
    }

    // Simple user creation (no password hashing for now)
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password,
        location,
      },
      select: {
        id: true,
        email: true,
        username: true,
        location: true,
        points: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: { user },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🎮 Gaming Platform API is ready!`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received. Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});
