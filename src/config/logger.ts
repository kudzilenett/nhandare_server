import winston from "winston";
import { env, isProduction } from "./environment";

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Safe JSON stringify that handles circular references
const safeStringify = (obj: any, space?: number): string => {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, val) => {
      if (val != null && typeof val === "object") {
        if (seen.has(val)) {
          return "[Circular]";
        }
        seen.add(val);
      }
      return val;
    },
    space
  );
};

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf((info: winston.Logform.TransformableInfo) => {
    const { timestamp, level, message, ...meta } = info;
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      try {
        log += `\n${safeStringify(meta, 2)}`;
      } catch (error) {
        log += `\n[Error stringifying meta data: ${error.message}]`;
      }
    }
    return log;
  })
);

// Create logger
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
  defaultMeta: { service: "nhandare-backend" },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Combined log file
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport for non-production environments
if (!isProduction) {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
} else {
  // In production, still log to console but with structured format
  logger.add(
    new winston.transports.Console({
      format: logFormat,
    })
  );
}

// Log uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new winston.transports.File({ filename: "logs/exceptions.log" })
);

logger.rejections.handle(
  new winston.transports.File({ filename: "logs/rejections.log" })
);

// Helper function for request logging
export const logRequest = (req: any, res: any, responseTime?: number) => {
  logger.info("HTTP Request", {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: responseTime ? `${responseTime}ms` : undefined,
    userAgent: req.get("User-Agent"),
    ip: req.ip,
    userId: req.user?.id,
  });
};

// Helper function for error logging
export const logError = (error: Error, context?: any) => {
  logger.error("Application Error", {
    message: error.message,
    stack: error.stack,
    context,
  });
};

// Helper function for security events
export const logSecurity = (event: string, details: any) => {
  logger.warn("Security Event", {
    event,
    ...details,
  });
};

export default logger;
