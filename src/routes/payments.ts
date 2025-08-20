import { Request, Response, Router } from "express";
import { PrismaClient, PaymentStatus } from "@prisma/client";
import { authenticate, adminOnly, authorize } from "../middleware/auth";
import {
  validateSchema,
  validateParams,
  schemas,
  paramSchemas,
} from "../middleware/validation";
import pesePayService from "../services/pesepay";
import logger from "../config/logger";
import { env, isDevelopment } from "../config/environment";
import joi from "joi";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();
const prisma = new PrismaClient();

// -------------------------------------------------------------
// Helper: processPaymentStatusUpdate
// Re-usable logic to map PesePay status → internal status, persist
// the payment row, emit socket events, and register the user in the
// tournament when payment completes.  Used by both webhook handler
// and on-demand status polling endpoint so that polling alone is
// sufficient in development environments where webhooks are not
// delivered.
// -------------------------------------------------------------

async function processPaymentStatusUpdate(
  reference: string,
  rawStatus: string | undefined,
  extraMetadata: any = {}
) {
  try {
    // 1. Map PesePay status → internal status
    let mappedStatus:
      | "PENDING"
      | "PROCESSING"
      | "COMPLETED"
      | "FAILED"
      | "CANCELLED"
      | "REFUNDED"
      | "EXPIRED" = "PENDING";

    const status = rawStatus?.toUpperCase();

    switch (status) {
      case "SUCCESS":
        mappedStatus = "COMPLETED";
        break;
      case "CANCELLED":
        mappedStatus = "CANCELLED";
        break;
      case "PROCESSING":
        mappedStatus = "PROCESSING";
        break;
      case "FAILED":
      case "ERROR":
      case "DECLINED":
      case "AUTHORIZATION_FAILED":
      case "INSUFFICIENT_FUNDS":
      case "SERVICE_UNAVAILABLE":
      case "TERMINATED":
        mappedStatus = "FAILED";
        break;
      case "REVERSED":
        mappedStatus = "REFUNDED";
        break;
      case "TIME_OUT":
      case "CLOSED":
      case "CLOSED_PERIOD_ELAPSED":
        mappedStatus = "EXPIRED";
        break;
      case "PARTIALLY_PAID":
      case "PENDING":
      case "INITIATED":
      default:
        mappedStatus = "PENDING";
    }

    // 2. Find payment by reference
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { pesePayReference: reference },
          { metadata: { path: ["pesepayReference"], equals: reference } },
        ],
      },
      include: { user: true, tournament: true },
    });

    if (!payment) {
      logger.warn("processPaymentStatusUpdate: payment not found", {
        reference,
      });
      return; // nothing more to do
    }

    if (payment.status === mappedStatus) {
      // No change → nothing to update
      return;
    }

    // 3. Persist update with enhanced metadata capture
    const updateData: any = {
      status: mappedStatus,
      pesePayReference: reference,
      paymentConfirmedAt: mappedStatus === "COMPLETED" ? new Date() : undefined,
      paymentFailedAt: mappedStatus === "FAILED" ? new Date() : undefined,
      failureReason:
        mappedStatus === "FAILED"
          ? extraMetadata?.message || "Payment failed"
          : undefined,
      metadata: {
        ...(payment.metadata as any),
        statusPolledAt: new Date().toISOString(),
        lastRawStatus: rawStatus,
        ...extraMetadata,
      },
    };

    // Update payment method code if we got it from webhook and don't already have it
    if (
      extraMetadata.paymentMethodDetails?.paymentMethodCode &&
      !payment.paymentMethodCode
    ) {
      updateData.paymentMethodCode =
        extraMetadata.paymentMethodDetails.paymentMethodCode;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: updateData,
    });

    // 4. Emit socket update so frontend gets real-time update even when using polling
    try {
      const { ioInstance } = await import("../socket");
      ioInstance?.to(`user:${payment.userId}`).emit("payment:update", {
        referenceNumber: reference,
        status: mappedStatus,
        paymentId: payment.id,
        tournamentId: payment.tournamentId,
        transactionStatus: rawStatus,
      });
    } catch (err) {
      logger.error("processPaymentStatusUpdate: socket emit failed", { err });
    }

    // 5. Register user in tournament (if applicable and successful)
    if (
      mappedStatus === "COMPLETED" &&
      payment.type === "ENTRY_FEE" &&
      payment.tournamentId
    ) {
      // Avoid duplicates
      const existingPlayer = await prisma.tournamentPlayer.findUnique({
        where: {
          userId_tournamentId: {
            userId: payment.userId,
            tournamentId: payment.tournamentId,
          },
        },
      });

      if (!existingPlayer) {
        await prisma.tournamentPlayer.create({
          data: {
            userId: payment.userId,
            tournamentId: payment.tournamentId,
            joinedAt: new Date(),
          },
        });

        await prisma.tournament.update({
          where: { id: payment.tournamentId },
          data: {
            currentPlayers: { increment: 1 },
          },
        });
        logger.info(
          "processPaymentStatusUpdate: user registered for tournament",
          {
            userId: payment.userId,
            tournamentId: payment.tournamentId,
            reference,
          }
        );
      }
    }
  } catch (err) {
    logger.error("processPaymentStatusUpdate error", { reference, err });
  }
}

// -------------------------------------------------------------
// Withdrawal request validation schema (manual payouts for now)
// -------------------------------------------------------------
const withdrawSchema = joi.object({
  amount: joi.number().positive().precision(2).required().messages({
    "number.base": "Amount must be a number",
    "number.positive": "Amount must be greater than zero",
    "any.required": "Amount is required",
  }),
  // Optional for future provider-specific handling
  mobileMoneyProviderCode: joi.string().optional(),
  destinationNumber: joi
    .string()
    .pattern(/^(\+263|263|07)[0-9]{8,9}$/)
    .optional()
    .messages({
      "string.pattern.base":
        "Destination number must be valid Zimbabwe format (+263XXXXXXXXX)",
    }),
});

// GET /api/payments/test-connection - Test PesePay connection
router.get("/test-connection", async (req: Request, res: Response) => {
  try {
    logger.info("Testing PesePay connection", { ip: req.ip });

    const isConnected = await pesePayService.testConnection();

    if (isConnected) {
      res.json({
        success: true,
        message: "PesePay connection successful",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: "PesePay connection failed",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("Error testing PesePay connection:", errorMessage);

    res.status(500).json({
      success: false,
      message: "Failed to test PesePay connection",
      error: isDevelopment ? errorMessage : undefined,
    });
  }
});

// GET /api/payments/methods - Get available payment methods
router.get("/methods", async (req: Request, res: Response) => {
  try {
    const currencyCode = (req.query.currency as string) || "USD";

    logger.info("Fetching payment methods", {
      currencyCode,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    const paymentMethods = await pesePayService.getPaymentMethods(currencyCode);

    res.json({
      success: true,
      data: paymentMethods,
      currency: currencyCode,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("Error fetching payment methods:", errorMessage);

    // Return empty methods instead of failing completely
    res.json({
      success: false,
      data: {
        cardMethods: [],
        mobileOnlyMethods: [],
        allMethods: [],
      },
      currency: (req.query.currency as string) || "USD",
      message: "Failed to fetch payment methods",
      error: isDevelopment ? errorMessage : undefined,
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/payments/mobile-money - Get Zimbabwe mobile money providers
router.get("/mobile-money", async (req: Request, res: Response) => {
  try {
    const mobileProviders = await pesePayService.getMobileMoneyProviders();

    res.json({
      success: true,
      message: "Mobile money providers fetched successfully",
      data: mobileProviders,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("Error fetching mobile money providers:", errorMessage);
    res.status(500).json({
      success: false,
      message: "Failed to fetch mobile money providers",
      error: errorMessage,
    });
  }
});

// POST /api/payments/initiate-tournament-entry - Initiate tournament entry payment
router.post(
  "/initiate-tournament-entry",
  authenticate,
  validateSchema(schemas.initiatePayment),
  async (req: Request, res: Response) => {
    try {
      const { tournamentId, returnUrl, resultUrl } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      // Get tournament details
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: { game: true },
      });

      if (!tournament) {
        res.status(404).json({
          success: false,
          message: "Tournament not found",
        });
        return;
      }

      // Basic validation
      if (tournament.status !== "OPEN") {
        res.status(400).json({
          success: false,
          message: "Tournament registration is closed",
        });
        return;
      }

      if (tournament.currentPlayers >= tournament.maxPlayers) {
        res.status(400).json({
          success: false,
          message: "Tournament is full",
        });
        return;
      }

      // Check if user is already registered
      const existingPlayer = await prisma.tournamentPlayer.findUnique({
        where: {
          userId_tournamentId: {
            userId,
            tournamentId,
          },
        },
      });

      if (existingPlayer) {
        res.status(400).json({
          success: false,
          message: "User is already registered for this tournament",
        });
        return;
      }

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Create payment record with basic fields
      const payment = await prisma.payment.create({
        data: {
          userId,
          tournamentId,
          amount: tournament.entryFee,
          currency: "USD",
          type: "ENTRY_FEE",
          status: "PENDING",
          metadata: {
            tournamentName: tournament.title,
            gameName: tournament.game.name,
          },
        },
      });

      // Prepare return URLs - Using in-app browser, no redirect needed
      const finalReturnUrl = returnUrl || undefined;
      const finalResultUrl =
        resultUrl ||
        `http://localhost:${env.PORT}/api/payments/webhook/pesepay`;

      // URLs configured for PesePay integration

      // Initiate payment with Pesepay (hosted checkout - minimal payload)
      const paymentResponse = await pesePayService.initiatePayment({
        amount: tournament.entryFee,
        userId,
        email: user.email,
        phoneNumber: "",
        customerName:
          `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
          user.username,
        paymentMethodCode: "",
        isCardPayment: false,
        returnUrl: finalReturnUrl,
        resultUrl: finalResultUrl,
      });

      // Persist PesePay reference & extra metadata so later polling can locate this payment
      try {
        // Extract payment method details if available from initiation response
        const paymentMethodCode =
          paymentResponse.paymentMethodDetails?.paymentMethodCode;

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            pesePayReference: paymentResponse.referenceNumber,
            paymentMethodCode: paymentMethodCode || null, // Store in dedicated column if available
            metadata: {
              ...(payment.metadata as any),
              pesepayReference: paymentResponse.referenceNumber,
              pollUrl: paymentResponse.pollUrl,
              redirectUrl: paymentResponse.redirectUrl,
              // Store full payment method details in metadata for future reference
              paymentMethodDetails:
                paymentResponse.paymentMethodDetails || null,
            },
          },
        });
      } catch (updateErr) {
        logger.error("Failed to persist PesePay reference on payment record", {
          paymentId: payment.id,
          err: updateErr instanceof Error ? updateErr.message : updateErr,
        });
      }

      res.json({
        success: true,
        message: "Payment initiated successfully",
        data: {
          paymentId: payment.id,
          ...paymentResponse,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error initiating tournament payment:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to initiate payment",
        error: errorMessage,
      });
    }
  }
);

// GET /api/payments/status/:referenceNumber - Check payment status
router.get(
  "/status/:referenceNumber",
  authenticate,
  validateParams(paramSchemas.referenceNumber),
  async (req: Request, res: Response) => {
    try {
      const { referenceNumber } = req.params;

      // DEBUG LOG: Track all status check requests
      logger.info("🔍 PAYMENT STATUS CHECK REQUEST RECEIVED", {
        service: "nhandare-backend",
        referenceNumber,
        userId: req.user?.id,
        timestamp: new Date().toISOString(),
        userAgent: req.headers["user-agent"],
      });

      // Disable caching for payment status checks to ensure real-time updates
      res.set({
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        ETag: false as any, // Disable ETag generation
      });

      // Check payment status with Pesepay
      const statusResponse = await pesePayService.checkPaymentStatus(
        referenceNumber
      );

      logger.info("Payment status check result", {
        referenceNumber,
        transactionStatus: statusResponse.transactionStatus,
        success: statusResponse.success,
        message: statusResponse.message,
        responseDataSize: JSON.stringify(statusResponse).length,
      });

      await processPaymentStatusUpdate(
        referenceNumber,
        statusResponse.transactionStatus,
        statusResponse
      );

      // Fetch payment record to include stored payment method details
      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { pesePayReference: referenceNumber },
            {
              metadata: { path: ["pesepayReference"], equals: referenceNumber },
            },
          ],
        },
        select: {
          paymentMethodCode: true,
          metadata: true,
        },
      });

      // Enhance response with payment method details from our database
      const metadata = payment?.metadata as any;
      const enhancedResponse = {
        ...statusResponse,
        paymentMethodDetails: metadata?.paymentMethodDetails || null,
        paymentMethodCode: payment?.paymentMethodCode || null,
      };

      res.json({
        success: true,
        message: "Payment status fetched successfully",
        data: enhancedResponse,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error checking payment status:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to check payment status",
        error: errorMessage,
      });
    }
  }
);

// GET /api/payments/user/:userId - Get user payment history
router.get(
  "/user/:userId",
  authenticate,
  validateParams(paramSchemas.userId),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user?.id;

      // Users can only view their own payment history
      if (userId !== requestingUserId) {
        res.status(403).json({
          success: false,
          message: "Access denied. Can only view own payment history",
        });
        return;
      }

      const payments = await prisma.payment.findMany({
        where: { userId },
        include: {
          tournament: {
            select: {
              id: true,
              title: true,
              game: {
                select: {
                  name: true,
                  emoji: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        success: true,
        message: "Payment history fetched successfully",
        data: payments,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching payment history:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to fetch payment history",
        error: errorMessage,
      });
    }
  }
);

// POST /api/payments/webhook/pesepay - Pesepay webhook handler
router.post("/webhook/pesepay", async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;

    logger.info("Pesepay webhook received", { webhookData });

    // Process webhook data from PesePay
    const {
      referenceNumber,
      transactionReference,
      transactionStatus,
      amount,
      currencyCode,
      resultUrl,
      reasonForPayment,
      paymentMethodDetails, // Extract payment method details if provided
    } = webhookData;

    const reference = referenceNumber || transactionReference;

    if (!reference) {
      logger.warn("Webhook received without reference number", { webhookData });
      res.status(400).json({
        success: false,
        message: "No reference number provided",
      });
      return;
    }

    await processPaymentStatusUpdate(reference, transactionStatus, {
      message: reasonForPayment,
      failureReason: reasonForPayment,
      // Pass full webhook data to capture payment method details
      fullWebhookData: webhookData,
      paymentMethodDetails: paymentMethodDetails || null,
    });

    res.json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("Error processing Pesepay webhook:", errorMessage);
    res.status(500).json({
      success: false,
      message: "Failed to process webhook",
      error: errorMessage,
    });
  }
});

// GET /api/payments/currencies - Get supported currencies
router.get("/currencies", async (req: Request, res: Response) => {
  try {
    const currencies = await pesePayService.getActiveCurrencies();

    res.json({
      success: true,
      message: "Currencies fetched successfully",
      data: currencies,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("Error fetching currencies:", errorMessage);
    res.status(500).json({
      success: false,
      message: "Failed to fetch currencies",
      error: errorMessage,
    });
  }
});

// GET /api/payments/wallet - wallet summary
router.get("/wallet", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const payments = await prisma.payment.findMany({
      where: {
        userId,
        status: {
          in: [
            PaymentStatus.COMPLETED,
            PaymentStatus.REFUNDED,
            PaymentStatus.PROCESSING,
            PaymentStatus.PENDING,
          ],
        },
      },
    });

    let balance = 0;
    payments.forEach((p) => {
      if (p.type === "PRIZE_PAYOUT" && p.status === PaymentStatus.COMPLETED)
        balance += p.amount;
      // Lock funds as soon as withdrawal is requested (all non-failed statuses)
      else if (p.type === "WITHDRAWAL") balance -= p.amount;
      else if (p.type === "ENTRY_FEE" && p.status === PaymentStatus.COMPLETED)
        balance -= p.amount;
    });

    res.json({ success: true, data: { balance } });
  } catch (err) {
    logger.error("Wallet summary error", { err });
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/payments/wallet/transactions - list
router.get(
  "/wallet/transactions",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 20 } = req.query as any;
      const skip = (Number(page) - 1) * Number(limit);

      const relevantStatuses: PaymentStatus[] = [
        PaymentStatus.COMPLETED,
        PaymentStatus.REFUNDED,
        PaymentStatus.PROCESSING,
        PaymentStatus.PENDING,
      ];

      const [transactions, total] = await Promise.all([
        prisma.payment.findMany({
          where: { userId, status: { in: relevantStatuses } },
          orderBy: { createdAt: "desc" },
          skip,
          take: Number(limit),
        }),
        prisma.payment.count({
          where: { userId, status: { in: relevantStatuses } },
        }),
      ]);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (err) {
      logger.error("Wallet tx error", { err });
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// POST /api/payments/withdraw  – Manual withdrawal request (no gateway call)
router.post(
  "/withdraw",
  authenticate,
  validateSchema(withdrawSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { amount, mobileMoneyProviderCode, destinationNumber } = req.body;

      // ---------------------------------------------------------
      // 1. Calculate current available balance (include pending withdrawals)
      // ---------------------------------------------------------
      const payments = await prisma.payment.findMany({
        where: {
          userId,
          status: {
            in: [
              PaymentStatus.COMPLETED,
              PaymentStatus.REFUNDED,
              PaymentStatus.PROCESSING,
              PaymentStatus.PENDING,
            ],
          },
        },
      });

      let balance = 0;
      payments.forEach((p) => {
        if (p.type === "PRIZE_PAYOUT") balance += p.amount;
        else if (p.type === "WITHDRAWAL" || p.type === "ENTRY_FEE")
          balance -= p.amount;
      });

      if (amount > balance) {
        res.status(400).json({
          success: false,
          message: "Insufficient balance for withdrawal",
        });
        return;
      }

      // ---------------------------------------------------------
      // 2. Create payment row marked as PROCESSING (manual payout)
      // ---------------------------------------------------------
      const payment = await prisma.payment.create({
        data: {
          userId,
          amount,
          currency: "USD",
          type: "WITHDRAWAL",
          status: "PROCESSING",
          metadata: {
            mobileMoneyProviderCode,
            destinationNumber,
            requestedAt: new Date().toISOString(),
            manualPayout: true,
          },
        },
      });

      logger.info("Withdrawal request created", {
        paymentId: payment.id,
        userId,
      });

      res.json({
        success: true,
        message: "Withdrawal request submitted and is now being processed",
        data: {
          paymentId: payment.id,
          status: payment.status,
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error("Withdrawal request error", { err });
      res.status(500).json({
        success: false,
        message: "Failed to create withdrawal request",
        error: errorMessage,
      });
    }
  }
);

// ===== ADMIN PAYMENT ENDPOINTS =====

// GET /api/payments/admin/withdrawals - Get withdrawal requests (admin only)
router.get(
  "/admin/withdrawals",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        sortBy = "createdAt",
        sortOrder = "desc",
        search,
        userId,
        startDate,
        endDate,
        minAmount,
        maxAmount,
      } = req.query;

      // Build where clause for withdrawal requests
      const where: any = {
        type: "WITHDRAWAL",
      };

      if (status) {
        where.status = Array.isArray(status) ? { in: status } : status;
      }
      if (userId) {
        where.userId = userId;
      }
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }
      if (minAmount || maxAmount) {
        where.amount = {};
        if (minAmount) where.amount.gte = parseFloat(minAmount as string);
        if (maxAmount) where.amount.lte = parseFloat(maxAmount as string);
      }

      // Calculate pagination
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const take = parseInt(limit as string);

      // Get withdrawal requests with user details
      const [withdrawals, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
          orderBy: { [sortBy as string]: sortOrder },
          skip,
          take,
        }),
        prisma.payment.count({ where }),
      ]);

      // Transform data for admin interface
      const withdrawalRequests = withdrawals.map((withdrawal) => ({
        id: withdrawal.id,
        userId: withdrawal.userId,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        status: withdrawal.status.toLowerCase(),
        destinationNumber: (withdrawal.metadata as any)?.destinationNumber,
        mobileMoneyProviderCode: (withdrawal.metadata as any)
          ?.mobileMoneyProviderCode,
        requestedAt: withdrawal.createdAt.toISOString(),
        processedAt: withdrawal.updatedAt.toISOString(),
        failureReason: withdrawal.failureReason,
        metadata: withdrawal.metadata,
        user: withdrawal.user,
      }));

      const totalPages = Math.ceil(total / take);
      const hasNextPage = parseInt(page as string) < totalPages;
      const hasPreviousPage = parseInt(page as string) > 1;

      res.json({
        success: true,
        data: {
          withdrawals: withdrawalRequests,
          pagination: {
            currentPage: parseInt(page as string),
            totalPages,
            totalItems: total,
            itemsPerPage: take,
            hasNextPage,
            hasPreviousPage,
          },
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching withdrawal requests:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to fetch withdrawal requests",
        error: errorMessage,
      });
    }
  }
);

// GET /api/payments/admin/withdrawals/stats - Get withdrawal statistics (admin only)
router.get(
  "/admin/withdrawals/stats",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;

      const where: any = {
        type: "WITHDRAWAL",
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      // Get withdrawal statistics
      const [
        totalWithdrawals,
        pendingWithdrawals,
        completedWithdrawals,
        failedWithdrawals,
        totalAmount,
        pendingAmount,
        completedAmount,
        averageAmount,
        statusDistribution,
      ] = await Promise.all([
        // Total withdrawals
        prisma.payment.count({ where }),
        // Pending withdrawals
        prisma.payment.count({
          where: { ...where, status: "PROCESSING" },
        }),
        // Completed withdrawals
        prisma.payment.count({
          where: { ...where, status: "COMPLETED" },
        }),
        // Failed withdrawals
        prisma.payment.count({
          where: { ...where, status: "FAILED" },
        }),
        // Total amount
        prisma.payment.aggregate({
          where,
          _sum: { amount: true },
        }),
        // Pending amount
        prisma.payment.aggregate({
          where: { ...where, status: "PROCESSING" },
          _sum: { amount: true },
        }),
        // Completed amount
        prisma.payment.aggregate({
          where: { ...where, status: "COMPLETED" },
          _sum: { amount: true },
        }),
        // Average amount
        prisma.payment.aggregate({
          where: { ...where, status: "COMPLETED" },
          _avg: { amount: true },
        }),
        // Status distribution
        prisma.payment.groupBy({
          by: ["status"],
          where,
          _count: { status: true },
          _sum: { amount: true },
        }),
      ]);

      const successRate =
        totalWithdrawals > 0
          ? (completedWithdrawals / totalWithdrawals) * 100
          : 0;

      const avgAmount =
        totalWithdrawals > 0 ? averageAmount._avg.amount || 0 : 0;

      const statusDistributionFormatted = statusDistribution.map((item) => ({
        status: item.status,
        count: item._count.status,
        amount: item._sum.amount || 0,
        percentage:
          totalWithdrawals > 0
            ? (item._count.status / totalWithdrawals) * 100
            : 0,
      }));

      res.json({
        success: true,
        data: {
          totalWithdrawals,
          pendingWithdrawals,
          completedWithdrawals,
          failedWithdrawals,
          totalAmount: totalAmount._sum.amount || 0,
          pendingAmount: pendingAmount._sum.amount || 0,
          completedAmount: completedAmount._sum.amount || 0,
          averageAmount: avgAmount,
          successRate,
          statusDistribution: statusDistributionFormatted,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching withdrawal statistics:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to fetch withdrawal statistics",
        error: errorMessage,
      });
    }
  }
);

// PUT /api/payments/admin/withdrawals/:id - Process withdrawal request (admin only)
router.put(
  "/admin/withdrawals/:id",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, failureReason, transactionReference } = req.body;

      // Validate status
      if (!["COMPLETED", "FAILED"].includes(status)) {
        res.status(400).json({
          success: false,
          message: "Invalid status. Must be COMPLETED or FAILED",
        });
        return;
      }

      // Find the withdrawal request
      const withdrawal = await prisma.payment.findFirst({
        where: {
          id,
          type: "WITHDRAWAL",
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!withdrawal) {
        res.status(404).json({
          success: false,
          message: "Withdrawal request not found",
        });
        return;
      }

      // Check if already processed
      if (withdrawal.status !== "PROCESSING") {
        res.status(400).json({
          success: false,
          message: "Withdrawal request has already been processed",
        });
        return;
      }

      // Update withdrawal status
      const updatedWithdrawal = await prisma.payment.update({
        where: { id },
        data: {
          status,
          failureReason: status === "FAILED" ? failureReason : null,
          metadata: {
            ...(withdrawal.metadata as any),
            transactionReference:
              status === "COMPLETED" ? transactionReference : null,
            processedAt: new Date().toISOString(),
            processedBy: (req as any).user.id,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // If failed, log the failure (no wallet balance to refund in current schema)
      if (status === "FAILED") {
        logger.info("Withdrawal failed", {
          service: "nhandare-backend",
          withdrawalId: id,
          userId: withdrawal.userId,
          amount: withdrawal.amount,
        });
      }

      logger.info("Withdrawal request processed", {
        service: "nhandare-backend",
        withdrawalId: id,
        userId: withdrawal.userId,
        status,
        processedBy: (req as any).user.id,
      });

      res.json({
        success: true,
        data: {
          withdrawal: {
            id: updatedWithdrawal.id,
            userId: updatedWithdrawal.userId,
            amount: updatedWithdrawal.amount,
            currency: updatedWithdrawal.currency,
            status: updatedWithdrawal.status.toLowerCase(),
            destinationNumber: (updatedWithdrawal.metadata as any)
              ?.destinationNumber,
            mobileMoneyProviderCode: (updatedWithdrawal.metadata as any)
              ?.mobileMoneyProviderCode,
            requestedAt: updatedWithdrawal.createdAt.toISOString(),
            processedAt: updatedWithdrawal.updatedAt.toISOString(),
            failureReason: updatedWithdrawal.failureReason,
            user: updatedWithdrawal.user,
          },
        },
      });
      return;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error processing withdrawal request:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to process withdrawal request",
        error: errorMessage,
      });
    }
  }
);

// GET /api/payments/admin - Get all payments with admin filtering
router.get(
  "/admin",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = "createdAt",
        sortOrder = "desc",
        status,
        type,
        currency,
        paymentMethod,
        search,
        userId,
        tournamentId,
        startDate,
        endDate,
        minAmount,
        maxAmount,
      } = req.query;

      // Build where clause
      const where: any = {};

      if (status) {
        where.status = Array.isArray(status) ? { in: status } : status;
      }
      if (type) {
        where.type = Array.isArray(type) ? { in: type } : type;
      }
      if (currency) {
        where.currency = Array.isArray(currency) ? { in: currency } : currency;
      }
      if (paymentMethod) {
        where.paymentMethodCode = Array.isArray(paymentMethod)
          ? { in: paymentMethod }
          : paymentMethod;
      }
      if (userId) {
        where.userId = userId;
      }
      if (tournamentId) {
        where.tournamentId = tournamentId;
      }
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }
      if (minAmount || maxAmount) {
        where.amount = {};
        if (minAmount) where.amount.gte = parseFloat(minAmount as string);
        if (maxAmount) where.amount.lte = parseFloat(maxAmount as string);
      }

      // Handle search
      if (search) {
        where.OR = [
          {
            pesePayReference: {
              contains: search as string,
              mode: "insensitive",
            },
          },
          {
            pesePayTransactionId: {
              contains: search as string,
              mode: "insensitive",
            },
          },
          {
            user: {
              username: { contains: search as string, mode: "insensitive" },
            },
          },
          {
            user: {
              email: { contains: search as string, mode: "insensitive" },
            },
          },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      // Get payments with user and tournament data
      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            tournament: {
              select: {
                id: true,
                title: true,
                game: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: { [sortBy as string]: sortOrder },
          skip,
          take: Number(limit),
        }),
        prisma.payment.count({ where }),
      ]);

      // Calculate statistics
      const totalAmount = await prisma.payment.aggregate({
        where: { ...where, status: "COMPLETED" },
        _sum: { amount: true },
      });

      const completedPayments = await prisma.payment.count({
        where: { ...where, status: "COMPLETED" },
      });

      const successRate = total > 0 ? (completedPayments / total) * 100 : 0;

      res.json({
        success: true,
        data: {
          payments,
          pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            totalItems: total,
            itemsPerPage: Number(limit),
            hasNextPage: Number(page) < Math.ceil(total / Number(limit)),
            hasPreviousPage: Number(page) > 1,
          },
          totalAmount: totalAmount._sum.amount || 0,
          averageAmount: total > 0 ? (totalAmount._sum.amount || 0) / total : 0,
          successRate,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching admin payments:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to fetch payments",
        error: errorMessage,
      });
    }
  }
);

// GET /api/payments/admin/prize-payouts - Get all prize payout payments (admin only)
router.get(
  "/admin/prize-payouts",
  authenticate,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    try {
      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: {
            type: "PRIZE_PAYOUT",
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            tournament: {
              select: {
                id: true,
                title: true,
                game: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          skip: offset,
          take: limit,
        }),
        prisma.payment.count({
          where: {
            type: "PRIZE_PAYOUT",
          },
        }),
      ]);

      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: {
          payments,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        },
      });
    } catch (error) {
      logger.error("Error fetching prize payouts", { error });
      res.status(500).json({
        success: false,
        message: "Failed to fetch prize payouts",
      });
    }
  })
);

// GET /api/payments/admin/:id - Get payment details for admin
router.get(
  "/admin/:id",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const payment = await prisma.payment.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          tournament: {
            select: {
              id: true,
              title: true,
              game: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: "Payment not found",
        });
        return;
      }

      // Get audit trail (mock for now - would need separate audit table)
      const auditTrail = [
        {
          id: "audit1",
          action: "Payment Created",
          previousStatus: "",
          newStatus: payment.status,
          performedBy: "System",
          reason: "Payment initiated",
          createdAt: payment.createdAt,
        },
        {
          id: "audit2",
          action: "Status Updated",
          previousStatus: "PENDING",
          newStatus: payment.status,
          performedBy: "PesePay Webhook",
          reason: "Payment processed",
          createdAt: payment.updatedAt,
        },
      ];

      res.json({
        success: true,
        data: {
          ...payment,
          auditTrail,
          refundHistory: [], // Would need separate refund table
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching payment details:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to fetch payment details",
        error: errorMessage,
      });
    }
  }
);

// PUT /api/payments/admin/:id/status - Update payment status (admin only)
router.put(
  "/admin/:id/status",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, reason, failureReason } = req.body;

      const payment = await prisma.payment.findUnique({
        where: { id },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: "Payment not found",
        });
        return;
      }

      const previousStatus = payment.status;

      // Update payment status
      const updatedPayment = await prisma.payment.update({
        where: { id },
        data: {
          status,
          failureReason: failureReason || payment.failureReason,
          updatedAt: new Date(),
        },
      });

      // Log the status change (in a real implementation, this would go to an audit table)
      logger.info("Admin payment status update", {
        paymentId: id,
        previousStatus,
        newStatus: status,
        updatedBy: req.user?.id,
        reason,
      });

      res.json({
        success: true,
        message: "Payment status updated successfully",
        data: updatedPayment,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error updating payment status:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to update payment status",
        error: errorMessage,
      });
    }
  }
);

// POST /api/payments/admin/:id/refund - Process refund (admin only)
router.post(
  "/admin/:id/refund",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;

      const payment = await prisma.payment.findUnique({
        where: { id },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: "Payment not found",
        });
        return;
      }

      if (payment.status !== "COMPLETED") {
        res.status(400).json({
          success: false,
          message: "Can only refund completed payments",
        });
        return;
      }

      const refundAmount = amount || payment.amount;

      if (refundAmount > payment.amount) {
        res.status(400).json({
          success: false,
          message: "Refund amount cannot exceed original payment amount",
        });
        return;
      }

      // Create refund payment record
      const refundPayment = await prisma.payment.create({
        data: {
          userId: payment.userId,
          tournamentId: payment.tournamentId,
          amount: refundAmount,
          currency: payment.currency,
          type: "REFUND",
          status: "PROCESSING",
          metadata: {
            originalPaymentId: payment.id,
            originalAmount: payment.amount,
            refundReason: reason,
            processedBy: req.user?.id,
            processedAt: new Date().toISOString(),
          },
        },
      });

      // Update original payment status to REFUNDED
      await prisma.payment.update({
        where: { id },
        data: {
          status: "REFUNDED",
          updatedAt: new Date(),
        },
      });

      res.json({
        success: true,
        message: "Refund processed successfully",
        data: {
          id: refundPayment.id,
          amount: refundAmount,
          reason,
          status: refundPayment.status,
          processedBy: req.user?.id,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error processing refund:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to process refund",
        error: errorMessage,
      });
    }
  }
);

// GET /api/payments/admin/analytics - Get payment analytics
router.get(
  "/admin/analytics",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;

      const where: any = {};
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      // Get analytics data
      const [
        totalRevenue,
        revenueThisMonth,
        revenueLastMonth,
        totalTransactions,
        transactionsThisMonth,
        successRate,
        failureRate,
        refundRate,
        averageTransactionValue,
        statusDistribution,
        paymentMethodDistribution,
      ] = await Promise.all([
        // Total revenue
        prisma.payment.aggregate({
          where: { ...where, status: "COMPLETED" },
          _sum: { amount: true },
        }),
        // This month revenue
        prisma.payment.aggregate({
          where: {
            ...where,
            status: "COMPLETED",
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
          _sum: { amount: true },
        }),
        // Last month revenue
        prisma.payment.aggregate({
          where: {
            ...where,
            status: "COMPLETED",
            createdAt: {
              gte: new Date(
                new Date().getFullYear(),
                new Date().getMonth() - 1,
                1
              ),
              lt: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
          _sum: { amount: true },
        }),
        // Total transactions
        prisma.payment.count({ where }),
        // This month transactions
        prisma.payment.count({
          where: {
            ...where,
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
        // Success rate
        prisma.payment.count({
          where: { ...where, status: "COMPLETED" },
        }),
        // Failure rate
        prisma.payment.count({
          where: { ...where, status: "FAILED" },
        }),
        // Refund rate
        prisma.payment.count({
          where: { ...where, type: "REFUND" },
        }),
        // Average transaction value
        prisma.payment.aggregate({
          where: { ...where, status: "COMPLETED" },
          _avg: { amount: true },
        }),
        // Status distribution
        prisma.payment.groupBy({
          by: ["status"],
          where,
          _count: { status: true },
          _sum: { amount: true },
        }),
        // Payment method distribution
        prisma.payment.groupBy({
          by: ["paymentMethodCode"],
          where: { ...where, status: "COMPLETED" },
          _count: { paymentMethodCode: true },
          _sum: { amount: true },
        }),
      ]);

      const total = await prisma.payment.count({ where });

      res.json({
        success: true,
        data: {
          totalRevenue: totalRevenue._sum.amount || 0,
          revenueThisMonth: revenueThisMonth._sum.amount || 0,
          revenueLastMonth: revenueLastMonth._sum.amount || 0,
          totalTransactions,
          transactionsThisMonth,
          successRate: total > 0 ? (successRate / total) * 100 : 0,
          failureRate: total > 0 ? (failureRate / total) * 100 : 0,
          refundRate: total > 0 ? (refundRate / total) * 100 : 0,
          averageTransactionValue: averageTransactionValue._avg.amount || 0,
          statusDistribution: statusDistribution.map((item) => ({
            status: item.status,
            count: item._count.status,
            percentage: total > 0 ? (item._count.status / total) * 100 : 0,
            amount: item._sum.amount || 0,
          })),
          popularPaymentMethods: paymentMethodDistribution.map((item) => ({
            method: item.paymentMethodCode || "Unknown",
            count: item._count.paymentMethodCode,
            percentage:
              total > 0 ? (item._count.paymentMethodCode / total) * 100 : 0,
            totalAmount: item._sum.amount || 0,
          })),
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching payment analytics:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to fetch analytics",
        error: errorMessage,
      });
    }
  }
);

// GET /api/payments/admin/filters - Get filter options
router.get(
  "/admin/filters",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const [statuses, types, currencies, paymentMethods] = await Promise.all([
        prisma.payment.groupBy({
          by: ["status"],
          _count: { status: true },
        }),
        prisma.payment.groupBy({
          by: ["type"],
          _count: { type: true },
        }),
        prisma.payment.groupBy({
          by: ["currency"],
          _count: { currency: true },
        }),
        prisma.payment.groupBy({
          by: ["paymentMethodCode"],
          _count: { paymentMethodCode: true },
        }),
      ]);

      res.json({
        success: true,
        data: {
          statuses: statuses.map((item) => ({
            label: item.status,
            value: item.status,
            count: item._count.status,
          })),
          types: types.map((item) => ({
            label: item.type,
            value: item.type,
            count: item._count.type,
          })),
          currencies: currencies.map((item) => ({
            label: item.currency,
            value: item.currency,
            count: item._count.currency,
          })),
          paymentMethods: paymentMethods.map((item) => ({
            label: item.paymentMethodCode || "Unknown",
            value: item.paymentMethodCode || "Unknown",
            count: item._count.paymentMethodCode,
          })),
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching filter options:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to fetch filter options",
        error: errorMessage,
      });
    }
  }
);

// PUT /api/payments/admin/bulk-update - Bulk update payment statuses
router.put(
  "/admin/bulk-update",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { paymentIds, status, reason } = req.body;

      if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
        res.status(400).json({
          success: false,
          message: "Payment IDs array is required",
        });
        return;
      }

      let success = 0;
      let failed = 0;
      const errors: Array<{ paymentId: string; error: string }> = [];

      for (const paymentId of paymentIds) {
        try {
          await prisma.payment.update({
            where: { id: paymentId },
            data: {
              status,
              failureReason: reason,
              updatedAt: new Date(),
            },
          });
          success++;
        } catch (error) {
          failed++;
          errors.push({
            paymentId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      res.json({
        success: true,
        message: `Bulk update completed. ${success} successful, ${failed} failed.`,
        data: {
          success,
          failed,
          errors,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error bulk updating payments:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to bulk update payments",
        error: errorMessage,
      });
    }
  }
);

// GET /api/payments/admin/search - Search payments by reference
router.get(
  "/admin/search",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const { reference } = req.query;

      if (!reference) {
        res.status(400).json({
          success: false,
          message: "Reference parameter is required",
        });
        return;
      }

      const payments = await prisma.payment.findMany({
        where: {
          OR: [
            {
              pesePayReference: {
                contains: reference as string,
                mode: "insensitive",
              },
            },
            {
              pesePayTransactionId: {
                contains: reference as string,
                mode: "insensitive",
              },
            },
          ],
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          tournament: {
            select: {
              id: true,
              title: true,
              game: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        success: true,
        data: {
          payments,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error searching payments:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to search payments",
        error: errorMessage,
      });
    }
  }
);

// POST /api/payments/admin/prize-payout - Create prize payout (admin only)
router.post(
  "/admin/prize-payout",
  authenticate,
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const {
        userId,
        amount,
        tournamentId,
        reason,
        currency = "USD",
      } = req.body;

      // Validate required fields
      if (!userId || !amount || !tournamentId) {
        res.status(400).json({
          success: false,
          message: "userId, amount, and tournamentId are required",
        });
        return;
      }

      // Validate amount
      if (amount <= 0) {
        res.status(400).json({
          success: false,
          message: "Amount must be greater than zero",
        });
        return;
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Check if tournament exists (optional validation)
      if (tournamentId) {
        const tournament = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { id: true, title: true },
        });

        if (!tournament) {
          res.status(404).json({
            success: false,
            message: "Tournament not found",
          });
          return;
        }
      }

      // Create prize payout payment
      const prizePayout = await prisma.payment.create({
        data: {
          userId,
          amount,
          currency,
          type: "PRIZE_PAYOUT",
          status: "COMPLETED", // Prize payouts are immediately completed
          tournamentId,
          metadata: {
            reason: reason || "Tournament prize payout",
            processedBy: req.user?.id,
            processedAt: new Date().toISOString(),
            adminNotes: req.body.adminNotes,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          tournament: {
            select: {
              id: true,
              title: true,
              game: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      // Log the action
      logger.info("Prize payout created", {
        payoutId: prizePayout.id,
        userId,
        amount,
        tournamentId,
        processedBy: req.user?.id,
        reason,
      });

      res.json({
        success: true,
        message: "Prize payout created successfully",
        data: {
          id: prizePayout.id,
          amount: prizePayout.amount,
          currency: prizePayout.currency,
          status: prizePayout.status,
          createdAt: prizePayout.createdAt.toISOString(),
          user: prizePayout.user,
          tournament: prizePayout.tournament,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error creating prize payout:", errorMessage);
      res.status(500).json({
        success: false,
        message: "Failed to create prize payout",
        error: errorMessage,
      });
    }
  }
);

export default router;
