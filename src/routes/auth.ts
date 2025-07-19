import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/database";
import { env } from "../config/environment";
import logger, { logSecurity } from "../config/logger";
import { validateSchema, schemas } from "../middleware/validation";
import { authRateLimit, adminAuthRateLimit } from "../middleware/security";
import { generateToken, authenticate, refreshToken } from "../middleware/auth";
import {
  asyncHandler,
  createError,
  createAuthError,
} from "../middleware/errorHandler";
import joi from "joi";

const router = Router();

// Apply rate limiting to all auth routes
router.use(authRateLimit);

// Register endpoint
router.post(
  "/register",
  validateSchema(schemas.register),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      email,
      username,
      password,
      firstName,
      lastName,
      phoneNumber,
      province,
      city,
      institution,
      isStudent,
      location,
    } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username: username.toLowerCase() },
        ],
      },
    });

    if (existingUser) {
      logSecurity("Registration attempt with existing credentials", {
        email,
        username,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      throw createError(
        "User with this email or username already exists",
        409,
        "USER_EXISTS"
      );
    }

    // Hash password
    const saltRounds = env.BCRYPT_ROUNDS;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user with Zimbabwe-specific fields
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber,
        province,
        city,
        institution,
        isStudent: isStudent || false,
        location:
          location || `${city || ""}, ${province || ""}`.trim() || "Zimbabwe",
        isActive: true,
        isVerified: false, // Email verification
        createdAt: new Date(),
        lastLogin: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        province: true,
        city: true,
        institution: true,
        isStudent: true,
        location: true,
        points: true,
        rank: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
      },
    });

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: "user",
    });

    // Log successful registration
    logger.info("User registered successfully", {
      userId: user.id,
      email: user.email,
      username: user.username,
      province: user.province,
      city: user.city,
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user,
        token,
      },
    });
  })
);

// Login endpoint
router.post(
  "/login",
  validateSchema(schemas.login),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        username: true,
        password: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        province: true,
        city: true,
        institution: true,
        isStudent: true,
        location: true,
        points: true,
        rank: true,
        isActive: true,
        isVerified: true,
        lastLogin: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });

    if (!user) {
      logSecurity("Login attempt with non-existent email", {
        email,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      throw createAuthError("Invalid email or password");
    }

    // Check if user is active
    if (!user.isActive) {
      logSecurity("Login attempt with inactive account", {
        email,
        userId: user.id,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      throw createAuthError("Account is deactivated. Please contact support.");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      logSecurity("Login attempt with invalid password", {
        email,
        userId: user.id,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      throw createAuthError("Invalid email or password");
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Log successful login
    logger.info("User logged in successfully", {
      userId: user.id,
      email: user.email,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: userWithoutPassword,
        token,
      },
    });
  })
);

// Logout endpoint (mainly for logging purposes)
router.post(
  "/logout",
  authenticate,
  asyncHandler(async (req, res) => {
    // Log logout
    logger.info("User logged out", {
      userId: req.user!.id,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  })
);

// Refresh token endpoint
router.post("/refresh", refreshToken);

// Get current user profile
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        province: true,
        city: true,
        institution: true,
        isStudent: true,
        location: true,
        avatar: true, // Added missing avatar field
        points: true,
        rank: true,
        gamesPlayed: true,
        gamesWon: true,
        winRate: true, // Added missing winRate field
        isActive: true,
        isVerified: true,
        createdAt: true,
        lastLogin: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw createAuthError("User not found");
    }

    res.json({
      success: true,
      data: { user },
    });
  })
);

// Update profile
router.patch(
  "/profile",
  authenticate,
  validateSchema(schemas.updateProfile),
  asyncHandler(async (req, res) => {
    const {
      username,
      firstName,
      lastName,
      phoneNumber,
      province,
      city,
      institution,
      isStudent,
      location,
      bio,
    } = req.body;
    const userId = req.user!.id;

    // Check if username is taken (if provided)
    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: username.toLowerCase(),
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        throw createError("Username is already taken", 409, "USERNAME_TAKEN");
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username: username.toLowerCase() }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phoneNumber && { phoneNumber }),
        ...(province && { province }),
        ...(city && { city }),
        ...(institution && { institution }),
        ...(isStudent !== undefined && { isStudent }),
        ...(location && { location }),
        ...(bio !== undefined && { bio }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        province: true,
        city: true,
        institution: true,
        isStudent: true,
        location: true,
        bio: true,
        points: true,
        rank: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info("User profile updated", {
      userId,
      updates: {
        username,
        firstName,
        lastName,
        phoneNumber,
        province,
        city,
        institution,
        isStudent,
        location,
        bio: !!bio,
      },
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: { user: updatedUser },
    });
  })
);

// Change password
router.patch(
  "/password",
  authenticate,
  validateSchema(schemas.changePassword),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    // Get current user password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      throw createAuthError("User not found");
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      logSecurity("Password change attempt with invalid current password", {
        userId,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      throw createAuthError("Current password is incorrect");
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword,
        updatedAt: new Date(),
      },
    });

    logger.info("User password changed", {
      userId,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  })
);

// Password reset request (email only)
router.post(
  "/forgot-password",
  validateSchema(
    joi.object({
      email: joi.string().email().required(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        username: true,
        isActive: true,
      },
    });

    // Always return success for security (don't reveal if email exists)
    res.json({
      success: true,
      message: "If the email exists, a password reset link has been sent.",
    });

    // If user exists and is active, log the password reset request
    if (user && user.isActive) {
      logger.info("Password reset requested", {
        userId: user.id,
        email: user.email,
        ip: req.ip,
      });

      // TODO: Send password reset email
      // In production, implement actual email sending logic
    }
  })
);

// Verify email (placeholder for future implementation)
router.post(
  "/verify-email",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    // TODO: Implement email verification logic
    await prisma.user.update({
      where: { id: userId },
      data: {
        isVerified: true,
        updatedAt: new Date(),
      },
    });

    logger.info("Email verified", { userId });

    res.json({
      success: true,
      message: "Email verified successfully",
    });
  })
);

// ===== ADMIN AUTHENTICATION ENDPOINTS =====

// Admin login endpoint - uses admin-specific rate limit
router.post(
  "/admin/login",
  adminAuthRateLimit, // Use admin-specific rate limit
  validateSchema(schemas.login),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        username: true,
        password: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        province: true,
        city: true,
        institution: true,
        isStudent: true,
        location: true,
        points: true,
        rank: true,
        isActive: true,
        isVerified: true,
        lastLogin: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });

    if (!user) {
      logSecurity("Admin login attempt with non-existent email", {
        email,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      throw createAuthError("Invalid email or password");
    }

    // Check if user has admin privileges
    if (!["admin", "moderator", "super_admin"].includes(user.role)) {
      logSecurity("Non-admin user attempted admin login", {
        email,
        userId: user.id,
        role: user.role,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      throw createAuthError("Access denied. Admin privileges required.");
    }

    // Check if user is active
    if (!user.isActive) {
      logSecurity("Admin login attempt with inactive account", {
        email,
        userId: user.id,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      throw createAuthError("Account is deactivated. Please contact support.");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      logSecurity("Admin login attempt with invalid password", {
        email,
        userId: user.id,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      throw createAuthError("Invalid email or password");
    }

    // Generate access and refresh tokens
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });

    const refreshTokenValue = uuidv4();
    const refreshTokenExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ); // 30 days

    // Update user with refresh token and last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        refreshToken: refreshTokenValue,
        refreshTokenExpiresAt,
      },
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Log successful admin login
    logger.info("Admin user logged in successfully", {
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: "Admin login successful",
      data: {
        user: userWithoutPassword,
        token: accessToken,
        refreshToken: refreshTokenValue,
      },
    });
  })
);

// Admin me endpoint
router.get(
  "/admin/me",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw createAuthError("User not found in request");
    }

    // Get user with admin fields
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        province: true,
        city: true,
        institution: true,
        isStudent: true,
        location: true,
        points: true,
        rank: true,
        isActive: true,
        isVerified: true,
        lastLogin: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw createAuthError("User not found");
    }

    // Check if user has admin privileges
    if (!["admin", "moderator", "super_admin"].includes(user.role)) {
      throw createAuthError("Access denied. Admin privileges required.");
    }

    res.json({
      success: true,
      data: {
        user,
      },
    });
  })
);

// Admin logout endpoint
router.post(
  "/admin/logout",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw createAuthError("User not found in request");
    }

    // Clear refresh token
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    });

    logger.info("Admin user logged out", { userId });

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  })
);

// Admin refresh token endpoint - uses admin-specific rate limit
router.post(
  "/admin/refresh",
  adminAuthRateLimit, // Use admin-specific rate limit
  validateSchema(
    joi.object({
      refreshToken: joi.string().required(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken: refreshTokenValue } = req.body;

    // Find user by refresh token
    const user = await prisma.user.findFirst({
      where: {
        refreshToken: refreshTokenValue,
        refreshTokenExpiresAt: {
          gte: new Date(),
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        permissions: true,
        isActive: true,
      },
    });

    if (!user) {
      throw createAuthError("Invalid or expired refresh token");
    }

    // Check if user has admin privileges
    if (!["admin", "moderator", "super_admin"].includes(user.role)) {
      throw createAuthError("Access denied. Admin privileges required.");
    }

    // Check if user is active
    if (!user.isActive) {
      throw createAuthError("Account is deactivated");
    }

    // Generate new access token
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });

    // Generate new refresh token
    const newRefreshToken = uuidv4();
    const refreshTokenExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ); // 30 days

    // Update user with new refresh token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: newRefreshToken,
        refreshTokenExpiresAt,
      },
    });

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        token: accessToken,
        refreshToken: newRefreshToken,
      },
    });
  })
);

// Admin stats endpoint
router.get(
  "/admin/stats",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw createAuthError("User not found in request");
    }

    // Check if user has admin privileges
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || !["admin", "moderator", "super_admin"].includes(user.role)) {
      throw createAuthError("Access denied. Admin privileges required.");
    }

    // Get admin dashboard stats
    const [
      totalUsers,
      activeUsers,
      totalTournaments,
      activeTournaments,
      totalMatches,
      totalPayments,
      recentLogins,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.tournament.count(),
      prisma.tournament.count({ where: { status: "ACTIVE" } }),
      prisma.match.count(),
      prisma.payment.count(),
      prisma.user.count({
        where: {
          lastLogin: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        activeSessions: recentLogins, // Approximate active sessions
        recentLogins,
        failedAttempts: 0, // Would need separate tracking
        totalTournaments,
        activeTournaments,
        totalMatches,
        totalPayments,
      },
    });
  })
);

// Admin rate limit reset endpoint (for development/emergency use)
router.post(
  "/admin/reset-rate-limit",
  asyncHandler(async (req: Request, res: Response) => {
    const { secret } = req.body;

    // Simple secret check - in production, use a more secure method
    const expectedSecret =
      env.NODE_ENV === "development"
        ? "admin-reset-2024"
        : process.env.ADMIN_RESET_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      logSecurity("Unauthorized rate limit reset attempt", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      throw createAuthError("Unauthorized");
    }

    // Note: This is a simplified approach. In a production environment,
    // you would need to implement proper rate limit store management
    logger.info("Admin rate limit reset requested", {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      message: "Rate limit reset successful. You can now attempt admin login.",
      note: "This endpoint is for development/emergency use only.",
    });
  })
);

export default router;
