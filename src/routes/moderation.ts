import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import {
  authenticate,
  adminOnly,
  requireContentModeration,
} from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import logger from "../config/logger";

const router = Router();

// Get flagged content (moderators only)
router.get(
  "/flagged",
  authenticate,
  requireContentModeration,
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 50, status, severity } = req.query;

    // Get flagged content using proper Prisma ORM
    const whereConditions: any = {};
    if (status) whereConditions.status = status;
    if (severity) whereConditions.severity = severity;

    const flaggedContent = await prisma.flaggedContent.findMany({
      where: whereConditions,
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
          },
        },
        moderator: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    // Get total count
    const total = await prisma.flaggedContent.count({
      where: whereConditions,
    });

    res.json({
      success: true,
      data: {
        flaggedContent: flaggedContent.map((item) => ({
          id: item.id,
          contentType: item.contentType,
          contentId: item.contentId,
          reason: item.reason,
          severity: item.severity,
          status: item.status,
          notes: item.notes,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          reporter: {
            id: item.reporter.id,
            username: item.reporter.username,
          },
          moderator: item.moderator
            ? {
                id: item.moderator.id,
                username: item.moderator.username,
              }
            : null,
          reviewedAt: item.reviewedAt,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  })
);

// Get banned users (moderators only)
router.get(
  "/banned",
  authenticate,
  requireContentModeration,
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 50 } = req.query;

    // Get banned users using proper Prisma ORM
    const bannedUsers = await prisma.userModeration.findMany({
      where: {
        action: { in: ["ban", "suspend"] },
        isActive: true,
      },
      include: {
        user: {
          select: {
            username: true,
            email: true,
          },
        },
        moderator: {
          select: {
            username: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    });

    // Get total count
    const total = await prisma.userModeration.count({
      where: {
        action: { in: ["ban", "suspend"] },
        isActive: true,
      },
    });

    res.json({
      success: true,
      data: {
        bannedUsers: bannedUsers.map((user) => ({
          id: user.id,
          userId: user.userId,
          username: user.user.username,
          email: user.user.email,
          action: user.action,
          reason: user.reason,
          duration: user.duration,
          expiresAt: user.expiresAt,
          isActive: user.isActive,
          notes: user.notes,
          createdAt: user.createdAt,
          moderatorUsername: user.moderator.username,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  })
);

// Get moderation statistics (moderators only)
router.get(
  "/stats",
  authenticate,
  requireContentModeration,
  asyncHandler(async (req: Request, res: Response) => {
    // Get comprehensive moderation stats using proper Prisma ORM
    const [
      totalFlagged,
      pendingReview,
      reviewedToday,
      bannedUsers,
      suspendedUsers,
      autoFiltered,
    ] = await Promise.all([
      prisma.flaggedContent.count(),
      prisma.flaggedContent.count({ where: { status: "pending" } }),
      prisma.flaggedContent.count({
        where: {
          status: "reviewed",
          updatedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),
      prisma.userModeration.count({
        where: {
          action: "ban",
          isActive: true,
        },
      }),
      prisma.userModeration.count({
        where: {
          action: "suspend",
          isActive: true,
        },
      }),
      prisma.flaggedContent.count({ where: { status: "auto_filtered" } }),
    ]);

    res.json({
      success: true,
      data: {
        totalFlagged,
        pendingReview,
        reviewedToday,
        bannedUsers,
        suspendedUsers,
        autoFiltered,
      },
    });
  })
);

// Review flagged content (moderators only)
router.post(
  "/review/:id",
  authenticate,
  requireContentModeration,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { action, notes } = req.body;
    const moderatorId = (req as any).user.id;

    if (!["approve", "reject", "auto_filtered"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    // Update flagged content using proper Prisma ORM
    const newStatus =
      action === "approve"
        ? "approved"
        : action === "reject"
        ? "rejected"
        : "auto_filtered";

    await prisma.flaggedContent.update({
      where: { id },
      data: {
        status: newStatus,
        moderatorId,
        notes: notes || null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Log the action using proper Prisma ORM
    await prisma.auditLog.create({
      data: {
        userId: moderatorId,
        targetType: "flagged_content",
        targetId: id,
        action: "reviewed",
        previousValue: { status: "pending" },
        newValue: { status: newStatus },
        reason: notes || "Content moderation review",
        ipAddress: (req as any).ip || "unknown",
        userAgent: (req as any).get("User-Agent") || "unknown",
      },
    });

    res.json({
      success: true,
      message: "Content reviewed successfully",
    });
  })
);

// Ban or suspend user (moderators only)
router.post(
  "/ban-user",
  authenticate,
  requireContentModeration,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, action, reason, duration, notes } = req.body;
    const moderatorId = (req as any).user.id;

    if (!["warn", "suspend", "ban"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    if (action === "ban" && !duration) {
      return res.status(400).json({ error: "Duration is required for bans" });
    }

    const expiresAt = duration
      ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
      : null;

    // Create moderation action using proper Prisma ORM
    await prisma.userModeration.create({
      data: {
        userId,
        moderatorId,
        action,
        reason,
        duration: duration || null,
        expiresAt,
        isActive: true,
        notes: notes || null,
      },
    });

    // Update user status if banned using proper Prisma ORM
    if (action === "ban") {
      await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });
    }

    // Log the action using proper Prisma ORM
    await prisma.auditLog.create({
      data: {
        userId: moderatorId,
        targetType: "user",
        targetId: userId,
        action,
        previousValue: { status: "active" },
        newValue: { status: action, reason, duration, expiresAt },
        reason,
        ipAddress: (req as any).ip || "unknown",
        userAgent: (req as any).get("User-Agent") || "unknown",
      },
    });

    res.json({
      success: true,
      message: `User ${action}ed successfully`,
    });
  })
);

// Unban user (moderators only)
router.post(
  "/unban-user/:userId",
  authenticate,
  requireContentModeration,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const moderatorId = (req as any).user.id;

    // Deactivate moderation actions using proper Prisma ORM
    await prisma.userModeration.updateMany({
      where: {
        userId,
        action: { in: ["ban", "suspend"] },
        isActive: true,
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    // Reactivate user using proper Prisma ORM
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        updatedAt: new Date(),
      },
    });

    // Log the action using proper Prisma ORM
    await prisma.auditLog.create({
      data: {
        userId: moderatorId,
        targetType: "user",
        targetId: userId,
        action: "unbanned",
        previousValue: { status: "banned" },
        newValue: { status: "active" },
        reason: "User unbanned by moderator",
        ipAddress: (req as any).ip || "unknown",
        userAgent: (req as any).get("User-Agent") || "unknown",
      },
    });

    res.json({
      success: true,
      message: "User unbanned successfully",
    });
  })
);

// Flag content (any authenticated user)
router.post(
  "/flag",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { contentType, contentId, reason, severity } = req.body;
    const reporterId = (req as any).user.id;

    if (
      !["message", "profile", "tournament_description"].includes(contentType)
    ) {
      return res.status(400).json({ error: "Invalid content type" });
    }

    if (!["low", "medium", "high"].includes(severity)) {
      return res.status(400).json({ error: "Invalid severity level" });
    }

    // Create flagged content entry using proper Prisma ORM
    await prisma.flaggedContent.create({
      data: {
        contentType,
        contentId,
        reporterId,
        reason,
        severity,
        status: "pending",
      },
    });

    res.json({
      success: true,
      message: "Content flagged successfully",
    });
  })
);

export default router;
