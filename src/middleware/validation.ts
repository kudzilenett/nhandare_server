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
    // Zimbabwe-specific fields
    firstName: joi.string().min(2).max(50).optional().messages({
      "string.min": "First name must be at least 2 characters",
      "string.max": "First name cannot exceed 50 characters",
    }),
    lastName: joi.string().min(2).max(50).optional().messages({
      "string.min": "Last name must be at least 2 characters",
      "string.max": "Last name cannot exceed 50 characters",
    }),
    phoneNumber: joi
      .string()
      .pattern(/^\+263[0-9]{9}$/)
      .optional()
      .messages({
        "string.pattern.base":
          "Phone number must be valid Zimbabwe format (+263XXXXXXXXX)",
      }),
    province: joi.string().min(2).max(50).optional().messages({
      "string.min": "Province must be at least 2 characters",
      "string.max": "Province cannot exceed 50 characters",
    }),
    city: joi.string().min(2).max(50).optional().messages({
      "string.min": "City must be at least 2 characters",
      "string.max": "City cannot exceed 50 characters",
    }),
    institution: joi.string().min(2).max(100).optional().messages({
      "string.min": "Institution must be at least 2 characters",
      "string.max": "Institution cannot exceed 100 characters",
    }),
    isStudent: joi.boolean().optional(),
    // Legacy location field (optional for backward compatibility)
    location: joi.string().min(2).max(100).optional().messages({
      "string.min": "Location must be at least 2 characters",
      "string.max": "Location cannot exceed 100 characters",
    }),
  }),

  login: joi.object({
    email: joi.string().email().required(),
    password: joi.string().required(),
  }),

  // User profile schemas
  updateProfile: joi.object({
    username: joi.string().alphanum().min(3).max(20).optional(),
    firstName: joi.string().min(2).max(50).optional(),
    lastName: joi.string().min(2).max(50).optional(),
    phoneNumber: joi
      .string()
      .pattern(/^\+263[0-9]{9}$/)
      .optional()
      .messages({
        "string.pattern.base":
          "Phone number must be valid Zimbabwe format (+263XXXXXXXXX)",
      }),
    province: joi.string().min(2).max(50).optional(),
    city: joi.string().min(2).max(50).optional(),
    institution: joi.string().min(2).max(100).optional(),
    isStudent: joi.boolean().optional(),
    bio: joi.string().max(500).optional(),
    // Legacy location field (optional for backward compatibility)
    location: joi.string().min(2).max(100).optional(),
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
    // Zimbabwe location fields
    province: joi.string().min(2).max(50).optional(),
    city: joi.string().min(2).max(50).optional(),
    venue: joi.string().max(100).optional(),
    isOnlineOnly: joi.boolean().default(true),
    // Legacy location field (optional for backward compatibility)
    location: joi.string().min(2).max(100).optional(),
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

  // Tournament validation schema
  tournament: joi.object({
    title: joi.string().min(3).max(100).required().messages({
      "any.required": "Tournament title is required",
      "string.min": "Title must be at least 3 characters long",
      "string.max": "Title cannot exceed 100 characters",
    }),
    description: joi.string().max(1000).optional(),
    gameId: joi.string().uuid().required().messages({
      "any.required": "Game ID is required",
      "string.guid": "Game ID must be a valid UUID",
    }),

    // Prize and fee validation
    entryFee: joi.number().min(1).max(100).required().messages({
      "any.required": "Entry fee is required",
      "number.min": "Entry fee must be at least $1 USD",
      "number.max": "Entry fee cannot exceed $100 USD",
    }),
    prizePool: joi.number().min(0).required(),
    maxPlayers: joi.number().integer().min(2).max(64).required().messages({
      "any.required": "Maximum players is required",
      "number.min": "Must allow at least 2 players",
      "number.max": "Cannot exceed 64 players",
    }),

    // Zimbabwe location validation
    province: joi
      .string()
      .valid(
        "Harare",
        "Bulawayo",
        "Manicaland",
        "Mashonaland Central",
        "Mashonaland East",
        "Mashonaland West",
        "Masvingo",
        "Matabeleland North",
        "Matabeleland South",
        "Midlands"
      )
      .optional(),
    city: joi.string().min(2).max(50).optional(),
    location: joi.string().max(100).optional(),
    venue: joi.string().max(100).optional(),
    isOnlineOnly: joi.boolean().default(true),

    // Tournament categories
    targetAudience: joi
      .string()
      .valid("university", "corporate", "public")
      .optional(),
    sponsorName: joi.string().max(100).optional(),
    minimumAge: joi.number().integer().min(13).max(100).optional(),
    maxAge: joi.number().integer().min(13).max(100).optional(),
    category: joi
      .string()
      .valid("UNIVERSITY", "CORPORATE", "PUBLIC", "INVITATION_ONLY")
      .optional(),
    difficultyLevel: joi
      .string()
      .valid("beginner", "intermediate", "advanced")
      .optional(),

    // Prize system
    prizeBreakdown: joi.object().optional(),
    localCurrency: joi.string().valid("USD", "ZWL").default("USD"),
    platformFeeRate: joi.number().min(0).max(0.5).default(0.2),

    // Dates
    registrationStart: joi.date().iso().required(),
    registrationEnd: joi
      .date()
      .iso()
      .greater(joi.ref("registrationStart"))
      .required(),
    startDate: joi.date().iso().greater(joi.ref("registrationEnd")).required(),
    endDate: joi.date().iso().greater(joi.ref("startDate")).optional(),

    // Bracket settings
    bracketType: joi
      .string()
      .valid("SINGLE_ELIMINATION", "DOUBLE_ELIMINATION", "ROUND_ROBIN", "SWISS")
      .default("SINGLE_ELIMINATION"),
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

    // Don't reassign req.query as it's read-only
    // The validated values are already in req.query
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

    // Don't reassign req.params as it's read-only
    // The validated values are already in req.params
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
