import { Request, Response, Router } from "express";
import { PrismaClient, PaymentStatus } from "@prisma/client";
import { authenticate } from "../middleware/auth";
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

    // 3. Persist update
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: mappedStatus,
        pesePayReference: reference,
        paymentConfirmedAt:
          mappedStatus === "COMPLETED" ? new Date() : undefined,
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
      },
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
      const {
        tournamentId,
        paymentMethodCode,
        mobileMoneyNumber,
        returnUrl,
        resultUrl,
      } = req.body;
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
            paymentMethodCode,
            mobileMoneyNumber,
          },
        },
      });

      // Initiate payment with Pesepay
      const paymentResponse = await pesePayService.initiatePayment({
        amount: tournament.entryFee,
        userId,
        email: user.email,
        phoneNumber: mobileMoneyNumber || "",
        customerName:
          `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
          user.username,
        paymentMethodCode,
        isCardPayment:
          paymentMethodCode.toUpperCase().includes("CARD") ||
          paymentMethodCode.toUpperCase().includes("VISA") ||
          paymentMethodCode.toUpperCase().includes("MASTERCARD"),
        returnUrl:
          returnUrl ||
          `nhandare://payments/return?tournamentId=${tournamentId}`,
        resultUrl:
          resultUrl ||
          `http://localhost:${env.PORT}/api/payments/webhook/pesepay`,
      });

      // Persist PesePay reference & extra metadata so later polling can locate this payment
      try {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            pesePayReference: paymentResponse.referenceNumber,
            metadata: {
              ...(payment.metadata as any),
              pesepayReference: paymentResponse.referenceNumber,
              pollUrl: paymentResponse.pollUrl,
              redirectUrl: paymentResponse.redirectUrl,
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

      res.json({
        success: true,
        message: "Payment status fetched successfully",
        data: statusResponse,
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

export default router;
