import { Request, Response, NextFunction } from "express";
import joi from "joi";
import logger from "../config/logger";

// Extend Express Request interface for file uploads
declare global {
  namespace Express {
    interface Request {
      file?: {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        destination: string;
        filename: string;
        path: string;
        buffer: Buffer;
      };
    }
  }
}

// Validation result interface
interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  sanitizedData?: any;
}

// Custom Joi validation function
export const validateSchema = (schema: joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      logger.warn("Validation failed", {
        url: req.url,
        method: req.method,
        errors,
        body: req.body,
      });

      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
      return;
    }

    // Replace req.body with sanitized data
    req.body = value;
    next();
  };
};

// Common validation schemas
export const schemas = {
  // User authentication schemas
  register: joi.object({
    email: joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required",
    }),
    username: joi.string().alphanum().min(3).max(20).required().messages({
      "string.alphanum": "Username can only contain letters and numbers",
      "string.min": "Username must be at least 3 characters long",
      "string.max": "Username cannot exceed 20 characters",
      "any.required": "Username is required",
    }),
    password: joi
      .string()
      .min(8)
      .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])"))
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters long",
        "string.pattern.base":
          "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character",
        "any.required": "Password is required",
      }),
    location: joi.string().min(2).max(100).required().messages({
      "string.min": "Location must be at least 2 characters",
      "string.max": "Location cannot exceed 100 characters",
      "any.required": "Location is required",
    }),
  }),

  login: joi.object({
    email: joi.string().email().required(),
    password: joi.string().required(),
  }),

  // User profile schemas
  updateProfile: joi.object({
    username: joi.string().alphanum().min(3).max(20).optional(),
    location: joi.string().min(2).max(100).optional(),
    bio: joi.string().max(500).optional(),
  }),

  changePassword: joi.object({
    currentPassword: joi.string().required(),
    newPassword: joi
      .string()
      .min(8)
      .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])"))
      .required(),
  }),

  // Tournament schemas
  createTournament: joi.object({
    name: joi.string().min(3).max(100).required(),
    description: joi.string().max(1000).optional(),
    gameId: joi.string().uuid().required(),
    maxPlayers: joi.number().integer().min(2).max(64).required(),
    entryFee: joi.number().min(0).required(),
    prizePool: joi.number().min(0).required(),
    startDate: joi.date().iso().greater("now").required(),
    endDate: joi.date().iso().greater(joi.ref("startDate")).required(),
    location: joi.string().min(2).max(100).required(),
    type: joi
      .string()
      .valid("single_elimination", "double_elimination", "round_robin", "swiss")
      .required(),
  }),

  joinTournament: joi.object({
    tournamentId: joi.string().uuid().required(),
  }),

  // Game match schemas
  createMatch: joi.object({
    gameId: joi.string().uuid().required(),
    opponentId: joi.string().uuid().optional(),
    isRanked: joi.boolean().default(false),
    timeControl: joi.number().integer().min(60).max(3600).optional(), // seconds
  }),

  makeMove: joi.object({
    matchId: joi.string().uuid().required(),
    move: joi.string().required(),
    gameState: joi.object().optional(),
  }),

  // Game result schema
  submitResult: joi.object({
    matchId: joi.string().uuid().required(),
    result: joi.string().valid("win", "loss", "draw").required(),
    gameData: joi.object().optional(),
  }),

  // Pagination schema
  pagination: joi.object({
    page: joi.number().integer().min(1).default(1),
    limit: joi.number().integer().min(1).max(100).default(20),
    sortBy: joi.string().optional(),
    sortOrder: joi.string().valid("asc", "desc").default("desc"),
  }),

  // Query filters
  userFilters: joi.object({
    search: joi.string().max(100).optional(),
    location: joi.string().max(100).optional(),
    minRank: joi.number().integer().min(1).optional(),
    maxRank: joi.number().integer().min(1).optional(),
  }),

  tournamentFilters: joi.object({
    status: joi
      .string()
      .valid("upcoming", "active", "completed", "cancelled")
      .optional(),
    gameType: joi.string().optional(),
    location: joi.string().max(100).optional(),
    minPrize: joi.number().min(0).optional(),
    maxPrize: joi.number().min(0).optional(),
  }),

  // Payment schemas for Zimbabwe/Pesepay integration
  initiatePayment: joi.object({
    tournamentId: joi.string().uuid().required().messages({
      "any.required": "Tournament ID is required",
      "string.guid": "Tournament ID must be a valid UUID",
    }),
    paymentMethodCode: joi.string().required().messages({
      "any.required": "Payment method is required",
    }),
    mobileMoneyNumber: joi
      .string()
      .pattern(/^\+263[0-9]{9}$/)
      .optional()
      .messages({
        "string.pattern.base":
          "Mobile money number must be valid Zimbabwe format (+263XXXXXXXXX)",
      }),
    returnUrl: joi.string().uri().optional(),
    resultUrl: joi.string().uri().optional(),
  }),

  processRefund: joi.object({
    paymentId: joi.string().uuid().required(),
    reason: joi.string().max(200).required(),
  }),

  updatePaymentStatus: joi.object({
    status: joi
      .string()
      .valid(
        "PENDING",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
        "REFUNDED"
      )
      .required(),
    failureReason: joi.string().max(200).optional(),
  }),

  // Zimbabwe-specific validation
  validateZimbabwePhone: joi.object({
    phoneNumber: joi
      .string()
      .pattern(/^\+263[0-9]{9}$/)
      .required()
      .messages({
        "string.pattern.base":
          "Phone number must be valid Zimbabwe format (+263XXXXXXXXX)",
        "any.required": "Phone number is required",
      }),
  }),

  // Payout validation
  processPayout: joi.object({
    userId: joi.string().uuid().required(),
    amount: joi.number().positive().required(),
    tournamentId: joi.string().uuid().required(),
    mobileMoneyNumber: joi
      .string()
      .pattern(/^\+263[0-9]{9}$/)
      .required()
      .messages({
        "string.pattern.base":
          "Mobile money number must be valid Zimbabwe format (+263XXXXXXXXX)",
      }),
    paymentMethodCode: joi.string().required(),
  }),
};

// Parameter validation schemas
export const paramSchemas = {
  id: joi.object({
    id: joi.string().uuid().required(),
  }),
  gameId: joi.object({
    gameId: joi.string().uuid().required(),
  }),
  userId: joi.object({
    userId: joi.string().uuid().required(),
  }),
  tournamentId: joi.object({
    tournamentId: joi.string().uuid().required(),
  }),
  matchId: joi.object({
    matchId: joi.string().uuid().required(),
  }),
  paymentId: joi.object({
    paymentId: joi.string().uuid().required(),
  }),
  referenceNumber: joi.object({
    referenceNumber: joi.string().required(),
  }),
};

// Query parameter validation
export const validateQuery = (schema: joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      res.status(400).json({
        success: false,
        message: "Query validation failed",
        errors,
      });
      return;
    }

    req.query = value;
    next();
  };
};

// URL parameter validation
export const validateParams = (schema: joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      res.status(400).json({
        success: false,
        message: "Parameter validation failed",
        errors,
      });
      return;
    }

    req.params = value;
    next();
  };
};

// File upload validation
export const validateFileUpload = (options: {
  maxSize?: number;
  allowedTypes?: string[];
  required?: boolean;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const file = req.file;

    if (options.required && !file) {
      res.status(400).json({
        success: false,
        message: "File upload is required",
      });
      return;
    }

    if (file) {
      // Check file size
      if (options.maxSize && file.size > options.maxSize) {
        res.status(400).json({
          success: false,
          message: `File size exceeds limit of ${options.maxSize} bytes`,
        });
        return;
      }

      // Check file type
      if (
        options.allowedTypes &&
        !options.allowedTypes.includes(file.mimetype)
      ) {
        res.status(400).json({
          success: false,
          message: `File type ${file.mimetype} is not allowed`,
        });
        return;
      }
    }

    next();
  };
};
