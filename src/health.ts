import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface HealthStatus {
  status: "healthy" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: {
      status: "healthy" | "unhealthy";
      responseTime: number;
      error?: string;
    };
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
}

export const healthCheck = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const healthStatus: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "1.0.0",
    services: {
      database: { status: "unhealthy", responseTime: 0 },
      memory: { used: 0, total: 0, percentage: 0 },
    },
  };

  // Check database health
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    healthStatus.services.database.status = "healthy";
    healthStatus.services.database.responseTime = Date.now() - dbStart;
  } catch (error) {
    healthStatus.services.database.status = "unhealthy";
    healthStatus.services.database.responseTime = Date.now() - dbStart;
    healthStatus.services.database.error =
      error instanceof Error ? error.message : "Unknown error";
    healthStatus.status = "unhealthy";
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  const totalMem = require("os").totalmem();
  healthStatus.services.memory = {
    used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    total: Math.round(totalMem / 1024 / 1024), // MB
    percentage: Math.round((memUsage.heapUsed / totalMem) * 100),
  };

  // Set response status
  const statusCode = healthStatus.status === "healthy" ? 200 : 503;

  // Add response time header
  res.setHeader("X-Response-Time", `${Date.now() - startTime}ms`);

  res.status(statusCode).json(healthStatus);
};

export const metrics = async (req: Request, res: Response) => {
  // Prometheus metrics endpoint
  const memUsage = process.memoryUsage();
  const totalMem = require("os").totalmem();

  const metrics = `# HELP nodejs_heap_size_total Process heap size from Node.js in bytes.
# TYPE nodejs_heap_size_total gauge
nodejs_heap_size_total ${memUsage.heapTotal}

# HELP nodejs_heap_size_used Process heap size used from Node.js in bytes.
# TYPE nodejs_heap_size_used gauge
nodejs_heap_size_used ${memUsage.heapUsed}

# HELP nodejs_heap_size_rss Process heap size from Node.js in bytes.
# TYPE nodejs_heap_size_rss gauge
nodejs_heap_size_rss ${memUsage.rss}

# HELP nodejs_external_memory_size_total Node.js external memory size in bytes.
# TYPE nodejs_external_memory_size_total gauge
nodejs_external_memory_size_total ${memUsage.external}

# HELP nodejs_heap_size_total_bytes Process heap size from Node.js in bytes.
# TYPE nodejs_heap_size_total_bytes gauge
nodejs_heap_size_total_bytes ${memUsage.heapTotal}

# HELP nodejs_heap_size_used_bytes Process heap size used from Node.js in bytes.
# TYPE nodejs_heap_size_used_bytes gauge
nodejs_heap_size_used_bytes ${memUsage.heapUsed}

# HELP nodejs_heap_size_rss_bytes Process heap size from Node.js in bytes.
# TYPE nodejs_heap_size_rss_bytes gauge
nodejs_heap_size_rss_bytes ${memUsage.rss}

# HELP nodejs_external_memory_size_total_bytes Node.js external memory size in bytes.
# TYPE nodejs_external_memory_size_total_bytes gauge
nodejs_external_memory_size_total_bytes ${memUsage.external}

# HELP nodejs_process_cpu_usage_total Total user and system CPU time spent in seconds.
# TYPE nodejs_process_cpu_usage_total counter
nodejs_process_cpu_usage_total ${process.cpuUsage().user / 1000000}

# HELP nodejs_process_start_time_seconds Start time of the process since unix epoch in seconds.
# TYPE nodejs_process_start_time_seconds gauge
nodejs_process_start_time_seconds ${process.uptime()}`;

  res.setHeader("Content-Type", "text/plain");
  res.send(metrics);
};
