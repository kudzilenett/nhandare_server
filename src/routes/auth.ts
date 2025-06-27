import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/database";
import { env } from "../config/environment";
import logger, { logSecurity } from "../config/logger";
import { validateSchema, schemas } from "../middleware/validation";
import { authRateLimit } from "../middleware/security";
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
      role: "user", // In production, fetch from user role table
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
        points: true,
        rank: true,
        gamesPlayed: true,
        gamesWon: true,
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

export default router;
