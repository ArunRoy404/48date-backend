/**
 * Centralized environment configuration.
 *
 * This file validates and exports all environment variables.
 * Add new env vars here as the project grows.
 *
 * Usage:
 *   import { env } from '../config/env.config.js';
 *   const port = env.PORT;
 *
 * Validation policy:
 * - In production the app refuses to boot with placeholder/missing JWT
 *   secrets — a misconfigured deploy must fail loudly, not run insecurely.
 * - In development everything degrades gracefully so the API can run with
 *   only Postgres + Redis up.
 */

const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

/** Values that must never reach production. */
const PLACEHOLDER_SECRETS = new Set(['', 'changeme', 'change-me', 'secret']);

function requireSecret(name: string, value: string | undefined): string {
  if (IS_PRODUCTION && (!value || PLACEHOLDER_SECRETS.has(value))) {
    throw new Error(
      `${name} is missing or still set to a placeholder value — refusing to start in production. Generate one with: openssl rand -hex 32`,
    );
  }
  return value ?? '';
}

function requireUrl(name: string, value: string | undefined): string {
  if (IS_PRODUCTION && !value) {
    throw new Error(`${name} is required in production.`);
  }
  return value ?? '';
}

export const env = {
  // Core
  NODE_ENV,
  IS_PRODUCTION,
  PORT: process.env.PORT ?? 3000,

  // Validation — see common/validators/is-public-url.validator.ts
  STRICT_URL_VALIDATION: process.env.STRICT_URL_VALIDATION === 'true',

  // Database
  DATABASE_URL: requireUrl('DATABASE_URL', process.env.DATABASE_URL),

  // Redis
  REDIS_URL: requireUrl('REDIS_URL', process.env.REDIS_URL),

  // Auth (JWT) — placeholder/missing secrets abort a production boot above.
  JWT_ACCESS_SECRET: requireSecret(
    'JWT_ACCESS_SECRET',
    process.env.JWT_ACCESS_SECRET,
  ),
  JWT_REFRESH_SECRET: requireSecret(
    'JWT_REFRESH_SECRET',
    process.env.JWT_REFRESH_SECRET,
  ),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  // Google sign-in — the OAuth client ID every ID token's `aud` claim must
  // match. Verified signatures are enforced in auth.service.googleLogin.
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,

  // Rate limiting — off by default; flip RATE_LIMIT_ENABLED=true to arm it.
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED === 'true',
  RATE_LIMIT_PER_MINUTE: Number(process.env.RATE_LIMIT_PER_MINUTE) || 100,
  RATE_LIMIT_AUTH_PER_MINUTE:
    Number(process.env.RATE_LIMIT_AUTH_PER_MINUTE) || 10,

  // Image storage (Cloudflare R2)
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  // Public base URL of the bucket (r2.dev or custom domain) - image URLs
  // returned to clients are built from this, not the private S3 API endpoint.
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,

  // Phone verification (Twilio)
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
  // Sender for outgoing SMS notifications (notifications.service.ts)
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,

  // Push notifications (FCM) — raw JSON pasted as one line; read directly
  // by notifications.service.ts (see docs/KNOWN-GAPS.md for why).
  FCM_SERVICE_ACCOUNT_JSON: process.env.FCM_SERVICE_ACCOUNT_JSON,

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
  // Optional explicit From; falls back to SMTP_USER when unset.
  SMTP_FROM: process.env.SMTP_FROM,
} as const;

/** True when Twilio Verify has every credential it needs. */
export function isTwilioConfigured(): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_VERIFY_SERVICE_SID,
  );
}

/** True when SMTP has every credential it needs to send OTP emails. */
export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
