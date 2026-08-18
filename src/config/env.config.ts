/**
 * Centralized environment configuration.
 *
 * This file validates and exports all environment variables.
 * Add new env vars here as the project grows.
 *
 * Usage:
 *   import { env } from '../config/env.config.js';
 *   const port = env.PORT;
 */

export const env = {
  // Core
  PORT: process.env.PORT ?? 3000,

  // Database
  DATABASE_URL: process.env.DATABASE_URL!,

  // Redis
  REDIS_URL: process.env.REDIS_URL!,

  // Auth (JWT)
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,

  // Image storage (Cloudflare R2)
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.R2_BUCKET,

  // Phone verification (Twilio)
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,

  // Push notifications (FCM)
  // FCM_SERVICE_ACCOUNT_* — paste the full service account JSON

  // Maps (Mapbox)
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN,

  // AI (OpenAI / Anthropic)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,

  // Subscriptions (RevenueCat)
  REVENUECAT_API_KEY: process.env.REVENUECAT_API_KEY,
  REVENUECAT_WEBHOOK_SECRET: process.env.REVENUECAT_WEBHOOK_SECRET,

  // Email (SMTP)
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
} as const;
