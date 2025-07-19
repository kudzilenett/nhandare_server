import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "../config/environment";
import { logSecurity } from "../config/logger";

// Rate limiting configuration
export const createRateLimit = (options?: {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options?.windowMs || env.RATE_LIMIT_WINDOW_MS,
    max: options?.max || env.RATE_LIMIT_MAX_REQUESTS,
    message: {
      error:
        options?.message ||
        "Too many requests from this IP, please try again later.",
      retryAfter: Math.ceil(
        (options?.windowMs || env.RATE_LIMIT_WINDOW_MS) / 1000
      ),
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options?.skipSuccessfulRequests || false,
    handler: (req: Request, res: Response) => {
      logSecurity("Rate limit exceeded", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        url: req.url,
        method: req.method,
      });

      res.status(429).json({
        success: false,
        error: "Too many requests from this IP, please try again later.",
        retryAfter: Math.ceil(
          (options?.windowMs || env.RATE_LIMIT_WINDOW_MS) / 1000
        ),
      });
    },
  });
};

// Specific rate limits for different endpoints
export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: "Too many authentication attempts, please try again later.",
  skipSuccessfulRequests: true,
});

// Admin-specific rate limit - more lenient for admin access
export const adminAuthRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window (more lenient)
  message: "Too many admin authentication attempts, please try again later.",
  skipSuccessfulRequests: true,
});

export const gameRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 game actions per minute
  message: "Too many game actions, please slow down.",
});

export const apiRateLimit = createRateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
});

// Security headers configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for API
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: true,
});

// Input sanitization middleware
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Basic XSS protection - remove script tags and javascript: protocols
  const sanitizeValue = (value: any): any => {
    if (typeof value === "string") {
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+\s*=/gi, "");
    }
    if (typeof value === "object" && value !== null) {
      const sanitized: any = {};
      for (const key in value) {
        sanitized[key] = sanitizeValue(value[key]);
      }
      return sanitized;
    }
    return value;
  };

  // Sanitize body (only if it exists and is mutable)
  if (req.body && typeof req.body === "object") {
    try {
      for (const key in req.body) {
        if (req.body.hasOwnProperty(key)) {
          req.body[key] = sanitizeValue(req.body[key]);
        }
      }
    } catch (error) {
      // If we can't modify body, continue without sanitizing
    }
  }

  // For query and params, we can't modify them directly in Express 5.x
  // The sanitization will be handled at the validation layer instead

  next();
};

// Security event logging middleware
export const logSecurityEvents = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const originalSend = res.send;

  res.send = function (body) {
    // Log failed authentication attempts
    if (res.statusCode === 401 || res.statusCode === 403) {
      logSecurity("Authentication/Authorization failure", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        url: req.url,
        method: req.method,
        statusCode: res.statusCode,
      });
    }

    // Log suspicious requests
    if (res.statusCode === 400 || res.statusCode === 422) {
      logSecurity("Bad request detected", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        url: req.url,
        method: req.method,
        statusCode: res.statusCode,
        body: req.body,
      });
    }

    return originalSend.call(this, body);
  };

  next();
};

// CORS configuration
export const corsConfig = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      env.FRONTEND_URL,
      env.SOCKET_CORS_ORIGIN,
      // Admin panel URLs
      env.ADMIN_PANEL_URL || "http://localhost:3000",
      // Allow Expo dev servers on local network (e.g., http://192.168.x.x:8081)
      ...(env.NODE_ENV === "development"
        ? [
            /^http:\/\/192\.168\.[0-9]{1,3}\.[0-9]{1,3}:8081$/,
            /^http:\/\/10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}:8081$/,
            /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9]{1,3}\.[0-9]{1,3}:8081$/,
            "http://localhost:3000",
          ]
        : []),
    ];

    const isAllowed = allowedOrigins.some((allowed) => {
      if (typeof allowed === "string") {
        return allowed === origin;
      }
      // RegExp
      return allowed.test(origin);
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      logSecurity("CORS violation", { origin, ip: "unknown" });
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: [
    "X-Total-Count",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
  ],
};

// Request size limiting
export const requestSizeLimit = {
  json: { limit: "10mb" },
  urlencoded: { limit: "10mb", extended: true },
};

// IP validation middleware
export const validateIP = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip;

  // Log suspicious IP patterns (basic implementation)
  if (
    ip &&
    ip.includes("127.0.0.1") === false &&
    ip.includes("::1") === false
  ) {
    // This is a real external IP - could add more sophisticated IP validation
    logSecurity("External IP access", { ip, url: req.url, method: req.method });
  }

  next();
};
