import { PrismaClient } from "@prisma/client";
import { env, isProduction } from "./environment";
import logger from "./logger";

// Create Prisma client instance with simplified logging
export const prisma = new PrismaClient({
  log: isProduction ? ["error"] : ["error", "warn"],
});

// Database connection health check
export const checkDatabaseHealth = async (): Promise<{
  status: "healthy" | "unhealthy";
  latency?: number;
  error?: string;
}> => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    return {
      status: "healthy",
      latency,
    };
  } catch (error) {
    logger.error("Database health check failed", { error });
    return {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Graceful database disconnect
export const disconnectDatabase = async () => {
  try {
    await prisma.$disconnect();
    logger.info("Database disconnected successfully");
  } catch (error) {
    logger.error("Error disconnecting from database", { error });
  }
};

// Database connection initialization
export const initializeDatabase = async () => {
  try {
    await prisma.$connect();
    logger.info("Database connected successfully");

    // Perform initial health check
    const health = await checkDatabaseHealth();
    if (health.status === "healthy") {
      logger.info("Database health check passed", { latency: health.latency });
    } else {
      logger.error("Database health check failed", { error: health.error });
      throw new Error("Database is not healthy");
    }
  } catch (error) {
    logger.error("Failed to initialize database connection", { error });
    throw error;
  }
};

export default prisma;
