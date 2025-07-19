import joi from "joi";
import { config } from "dotenv";

// Load environment variables
config();

// Environment validation schema
const envSchema = joi
  .object({
    NODE_ENV: joi
      .string()
      .valid("development", "production", "test")
      .default("development"),
    PORT: joi.number().default(3001),

    // Database
    DATABASE_URL: joi.string().required(),

    // JWT
    JWT_SECRET: joi.string().min(32).required(),
    JWT_EXPIRE: joi.string().default("7d"),

    // CORS
    FRONTEND_URL: joi.string().uri().required(),
    ADMIN_PANEL_URL: joi.string().uri().default("http://localhost:3000"),

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: joi.number().default(900000), // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: joi.number().default(100),

    // Logging
    LOG_LEVEL: joi
      .string()
      .valid("error", "warn", "info", "debug")
      .default("info"),

    // Socket.io
    SOCKET_CORS_ORIGIN: joi.string().uri().required(),

    // Security
    BCRYPT_ROUNDS: joi.number().default(12),

    // Game Configuration
    CHESS_AI_DIFFICULTY: joi
      .string()
      .valid("random", "easy", "medium", "hard")
      .default("random"),
    TOURNAMENT_MAX_PLAYERS: joi.number().default(64),

    // Email (for future use)
    SMTP_HOST: joi.string().optional(),
    SMTP_PORT: joi.number().optional(),
    SMTP_USER: joi.string().optional(),
    SMTP_PASS: joi.string().optional(),

    // Redis (for future caching)
    REDIS_URL: joi.string().optional(),

    // File uploads
    MAX_FILE_SIZE: joi.number().default(5242880), // 5MB
    UPLOAD_PATH: joi.string().default("./uploads"),

    // Pesepay Configuration (Zimbabwe Payments)
    PESEPAY_INTEGRATION_KEY: joi.string().required(),
    PESEPAY_ENCRYPTION_KEY: joi.string().required(),
    PESEPAY_API_URL: joi
      .string()
      .uri()
      .default("https://api.pesepay.com/api/payments-engine"),
    PESEPAY_ENVIRONMENT: joi
      .string()
      .valid("sandbox", "production")
      .default("sandbox"),

    // Zimbabwe Business Configuration
    DEFAULT_CURRENCY: joi.string().default("USD"),
    SUPPORTED_CURRENCIES: joi.string().default("USD,ZWL"),
    ZIMBABWE_PHONE_PREFIX: joi.string().default("+263"),
    MIN_TOURNAMENT_ENTRY_FEE: joi.number().default(1), // $1 USD
    MAX_TOURNAMENT_ENTRY_FEE: joi.number().default(100), // $100 USD
    PLATFORM_FEE_PERCENTAGE: joi.number().default(0.2), // 20%
    MIN_PRIZE_PAYOUT_PERCENTAGE: joi.number().default(0.7), // 70% to winners
  })
  .unknown();

const { error, value: validatedEnv } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

export interface Environment {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRE: string;
  FRONTEND_URL: string;
  ADMIN_PANEL_URL: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  LOG_LEVEL: "error" | "warn" | "info" | "debug";
  SOCKET_CORS_ORIGIN: string;
  BCRYPT_ROUNDS: number;
  CHESS_AI_DIFFICULTY: "random" | "easy" | "medium" | "hard";
  TOURNAMENT_MAX_PLAYERS: number;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  REDIS_URL?: string;
  MAX_FILE_SIZE: number;
  UPLOAD_PATH: string;

  // Pesepay Configuration
  PESEPAY_INTEGRATION_KEY: string;
  PESEPAY_ENCRYPTION_KEY: string;
  PESEPAY_API_URL: string;
  PESEPAY_ENVIRONMENT: "sandbox" | "production";

  // Zimbabwe Business Configuration
  DEFAULT_CURRENCY: string;
  SUPPORTED_CURRENCIES: string;
  ZIMBABWE_PHONE_PREFIX: string;
  MIN_TOURNAMENT_ENTRY_FEE: number;
  MAX_TOURNAMENT_ENTRY_FEE: number;
  PLATFORM_FEE_PERCENTAGE: number;
  MIN_PRIZE_PAYOUT_PERCENTAGE: number;
}

export const env: Environment = validatedEnv as Environment;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
