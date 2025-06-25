import { Request, Response, NextFunction } from "express";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { logError } from "../config/logger";
import { env, isProduction } from "../config/environment";

export interface ApiError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

// Custom error class
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errorCode = errorCode;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation error class
export class ValidationError extends AppError {
  public errors: string[];

  constructor(message: string, errors: string[]) {
    super(message, 400, "VALIDATION_ERROR");
    this.errors = errors;
  }
}

// Database error class
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: any) {
    super(message, 500, "DATABASE_ERROR");
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

// Authentication error class
export class AuthError extends AppError {
  constructor(message: string) {
    super(message, 401, "AUTH_ERROR");
  }
}

// Authorization error class
export class AuthorizationError extends AppError {
  constructor(message: string) {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

// Handle Prisma errors
const handlePrismaError = (error: PrismaClientKnownRequestError): AppError => {
  switch (error.code) {
    case "P2002":
      // Unique constraint violation
      const field = error.meta?.target as string[] | undefined;
      const fieldName = field ? field[0] : "field";
      return new AppError(
        `${fieldName} already exists`,
        409,
        "DUPLICATE_ENTRY"
      );

    case "P2025":
      // Record not found
      return new AppError("Resource not found", 404, "NOT_FOUND");

    case "P2003":
      // Foreign key constraint failed
      return new AppError(
        "Invalid reference to related resource",
        400,
        "INVALID_REFERENCE"
      );

    case "P2014":
      // Required relation is missing
      return new AppError(
        "Required related resource is missing",
        400,
        "MISSING_RELATION"
      );

    case "P2021":
      // Table does not exist
      return new DatabaseError("Database schema error", error);

    case "P2022":
      // Column does not exist
      return new DatabaseError("Database schema error", error);

    default:
      return new DatabaseError("Database operation failed", error);
  }
};

// Handle JWT errors
const handleJWTError = (
  error: JsonWebTokenError | TokenExpiredError
): AppError => {
  if (error instanceof TokenExpiredError) {
    return new AuthError("Token has expired");
  }

  switch (error.name) {
    case "JsonWebTokenError":
      return new AuthError("Invalid token");
    case "NotBeforeError":
      return new AuthError("Token not active yet");
    default:
      return new AuthError("Token verification failed");
  }
};

// Handle validation errors
const handleValidationError = (error: any): AppError => {
  if (error.details && Array.isArray(error.details)) {
    const errors = error.details.map((detail: any) => detail.message);
    return new ValidationError("Validation failed", errors);
  }
  return new AppError("Validation failed", 400, "VALIDATION_ERROR");
};

// Send error response in development
const sendErrorDev = (err: AppError, res: Response) => {
  res.status(err.statusCode).json({
    success: false,
    error: {
      statusCode: err.statusCode,
      message: err.message,
      errorCode: err.errorCode,
      stack: err.stack,
      ...(err instanceof ValidationError && { errors: err.errors }),
    },
  });
};

// Send error response in production
const sendErrorProd = (err: AppError, res: Response) => {
  // Only send operational errors to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        errorCode: err.errorCode,
        ...(err instanceof ValidationError && { errors: err.errors }),
      },
    });
  } else {
    // Don't leak error details in production
    res.status(500).json({
      success: false,
      error: {
        message: "Something went wrong!",
        errorCode: "INTERNAL_ERROR",
      },
    });
  }
};

// Global error handling middleware
export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Set default error properties
  err.statusCode = err.statusCode || 500;
  err.isOperational = err.isOperational || false;

  // Log error
  logError(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    userId: req.user?.id,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  // Handle specific error types
  let error = { ...err };
  error.message = err.message;

  // Prisma errors
  if (err instanceof PrismaClientKnownRequestError) {
    error = handlePrismaError(err);
  }

  // JWT errors
  if (err instanceof JsonWebTokenError || err instanceof TokenExpiredError) {
    error = handleJWTError(err);
  }

  // Joi validation errors
  if (err.isJoi) {
    error = handleValidationError(err);
  }

  // Express validator errors
  if (err.type === "entity.parse.failed") {
    error = new AppError("Invalid JSON format", 400, "INVALID_JSON");
  }

  // Cast error for invalid IDs
  if (err.name === "CastError") {
    error = new AppError("Invalid ID format", 400, "INVALID_ID");
  }

  // Handle file upload errors
  if (err.code === "LIMIT_FILE_SIZE") {
    error = new AppError("File too large", 413, "FILE_TOO_LARGE");
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    error = new AppError("Unexpected file field", 400, "UNEXPECTED_FILE");
  }

  // Handle rate limiting errors
  if (err.type === "request-too-many") {
    error = new AppError("Too many requests", 429, "RATE_LIMIT_EXCEEDED");
  }

  // Send error response
  if (isProduction) {
    sendErrorProd(error, res);
  } else {
    sendErrorDev(error, res);
  }
};

// Async error handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Create error response helper
export const createError = (
  message: string,
  statusCode: number,
  errorCode?: string
) => {
  return new AppError(message, statusCode, errorCode);
};

// Validation error helper
export const createValidationError = (message: string, errors: string[]) => {
  return new ValidationError(message, errors);
};

// Database error helper
export const createDatabaseError = (message: string, originalError?: any) => {
  return new DatabaseError(message, originalError);
};

// Authentication error helper
export const createAuthError = (message: string) => {
  return new AuthError(message);
};

// Authorization error helper
export const createAuthorizationError = (message: string) => {
  return new AuthorizationError(message);
};
