import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/environment";
import { logSecurity } from "../config/logger";

const prisma = new PrismaClient();

// Express Request interface is extended in src/express.d.ts

// JWT Token payload interface
interface JWTPayload {
  id: string;
  email: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Generate JWT token
export const generateToken = (user: {
  id: string;
  email: string;
  username: string;
  role?: string;
}): string => {
  const payload = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role || "user",
  };

  const options: jwt.SignOptions = {
    expiresIn: env.JWT_EXPIRE as any,
    issuer: "nhandare-backend",
    audience: "nhandare-users",
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
};

// Verify JWT token
export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: "nhandare-backend",
      audience: "nhandare-users",
    }) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
};

// Authentication middleware
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logSecurity("Missing or invalid authorization header", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        url: req.url,
      });

      res.status(401).json({
        success: false,
        message: "Access token required",
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token);

    if (!decoded) {
      logSecurity("Invalid or expired token", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        url: req.url,
      });

      res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
      return;
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        username: true,
        isActive: true,
        lastLogin: true,
      },
    });

    if (!user || !user.isActive) {
      logSecurity("Token user not found or inactive", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        url: req.url,
        userId: decoded.id,
      });

      res.status(401).json({
        success: false,
        message: "User account not found or inactive",
      });
      return;
    }

    // Attach user to request - we need to fetch the full user from database
    const fullUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        province: true,
        city: true,
        institution: true,
        isStudent: true,
        location: true,
        avatar: true,
        bio: true,
        dateOfBirth: true,
        gender: true,
        permissions: true,
        refreshToken: true,
        refreshTokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (fullUser) {
      req.user = fullUser as any; // Type assertion to bypass strict typing
    }

    next();
  } catch (error) {
    logSecurity("Authentication error", {
      error: error instanceof Error ? error.message : "Unknown error",
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      url: req.url,
    });

    res.status(500).json({
      success: false,
      message: "Authentication error",
    });
    return;
  }
};

// Optional authentication (doesn't require token)
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(); // Continue without authentication
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (decoded) {
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          username: true,
          isActive: true,
        },
      });

      if (user && user.isActive) {
        req.user = user as any; // Type assertion to bypass strict typing
      }
    }

    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

// Role-based authorization
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logSecurity("Insufficient permissions", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        url: req.url,
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
      });

      res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
      return;
    }

    next();
  };
};

// Admin only authorization
export const adminOnly = authorize(["admin", "super_admin"]);

// Moderator or admin authorization
export const moderatorOrAdmin = authorize([
  "moderator",
  "admin",
  "super_admin",
]);

// Permission-based authorization
export const requirePermission = (permission: string) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    // Super admins have all permissions
    if (req.user.role === "super_admin") {
      next();
      return;
    }

    // Check user permissions in database
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { permissions: true, role: true },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const hasPermission = user.permissions.includes(permission);

    if (!hasPermission) {
      logSecurity("Insufficient permissions for specific action", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        url: req.url,
        userId: req.user.id,
        userRole: req.user.role,
        requiredPermission: permission,
        userPermissions: user.permissions,
      });

      res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: ${permission}`,
      });
      return;
    }

    next();
  };
};

// Common permission helpers
export const requireUserManagement = requirePermission("users:manage");
export const requireTournamentManagement =
  requirePermission("tournaments:manage");
export const requirePaymentManagement = requirePermission("payments:manage");
export const requireAnalyticsView = requirePermission("analytics:view");
export const requireContentModeration = requirePermission("content:moderate");
export const requireSystemConfiguration = requirePermission("system:configure");

// User ownership check (user can only access their own resources)
export const checkOwnership = (userIdParam: string = "userId") => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const resourceUserId = req.params[userIdParam];

    // Admin can access any resource
    if (req.user.role === "admin") {
      next();
      return;
    }

    // User can only access their own resources
    if (req.user.id !== resourceUserId) {
      logSecurity("Unauthorized resource access attempt", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        url: req.url,
        userId: req.user.id,
        resourceUserId,
      });

      res.status(403).json({
        success: false,
        message: "Access denied: You can only access your own resources",
      });
      return;
    }

    next();
  };
};

// Refresh token middleware
export const refreshToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        message: "Refresh token required",
      });
      return;
    }

    const decoded = verifyToken(refreshToken);

    if (!decoded) {
      res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
      return;
    }

    // Verify user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        username: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
      return;
    }

    // Generate new token
    const newToken = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
    });

    res.json({
      success: true,
      data: {
        token: newToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Token refresh failed",
    });
  }
};
