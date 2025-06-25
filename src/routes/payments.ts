import { Request, Response, Router } from "express";
import { PrismaClient } from "@prisma/client";
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

const router = Router();
const prisma = new PrismaClient();

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
          `${env.FRONTEND_URL}/tournament/${tournamentId}/payment/return`,
        resultUrl:
          resultUrl || `${env.FRONTEND_URL}/api/payments/webhook/pesepay`,
      });

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

      // Check payment status with Pesepay
      const statusResponse = await pesePayService.checkPaymentStatus(
        referenceNumber
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

    // TODO: Process webhook data based on Pesepay's webhook format
    // This is a placeholder for now

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

export default router;
