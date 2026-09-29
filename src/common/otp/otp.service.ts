import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomInt, createHash } from 'crypto';
import { Redis } from 'ioredis';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import twilio from 'twilio';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  env,
  isSmtpConfigured,
  isTwilioConfigured,
} from '../../config/env.config.js';

/** Which identifier an OTP is being sent to. */
export type OtpChannel = 'PHONE' | 'EMAIL';

/**
 * What the code is for. Each purpose has its own cooldown column, so logging in
 * does not block a user from verifying an email they added moments later.
 */
export type OtpPurpose = 'AUTH' | 'CONTACT';

const COOLDOWN_FIELD: Record<
  OtpPurpose,
  'lastOtpSentAt' | 'lastContactOtpSentAt'
> = {
  AUTH: 'lastOtpSentAt',
  CONTACT: 'lastContactOtpSentAt',
};

export interface OtpDispatchResult {
  sent: boolean;
  message: string;
  /** Present only in development when no provider is configured. */
  otp?: string;
}

/**
 * Development fallback. Accepted ONLY when the matching provider (Twilio for
 * PHONE, SMTP for EMAIL) is not configured AND the app is not running in
 * production. In production a missing provider fails closed with a 503 —
 * this code is never accepted there, closing the previous takeover hole
 * where `123456` verified any account.
 */
export const DUMMY_OTP = '123456';

/**
 * How long a user must wait between OTP dispatches, across every endpoint that
 * sends one. Without it, a user leaning on "resend" burns SMS credit and anyone
 * can spam a stranger's phone for free.
 */
export const OTP_COOLDOWN_SECONDS = 30;

/** Lifetime of a generated email OTP. */
export const EMAIL_OTP_TTL_SECONDS = 10 * 60;

/** Verify attempts allowed before the code is invalidated. */
const EMAIL_OTP_MAX_ATTEMPTS = 5;

/**
 * Every OTP in the system goes through here — login, resend, and the profile
 * contact-verification flow.
 *
 * Provider matrix (see docs/KNOWN-GAPS.md for the deferred items):
 *
 * | Channel | Provider configured            | Not configured (development)    | Not configured (production)      |
 * |---------|--------------------------------|---------------------------------|----------------------------------|
 * | PHONE   | Twilio Verify SMS              | dummy `123456` in the response  | 503 — sign-in unavailable        |
 * | EMAIL   | generated code via SMTP + Redis| dummy `123456` in the response  | 503 — verification unavailable   |
 *
 * A dummy code is rejected whenever its provider IS configured — even in
 * development — so the real delivery path is always testable locally.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly emailTransporter?: Transporter;
  private redisClient?: Redis;

  constructor(private readonly prisma: PrismaService) {
    if (isSmtpConfigured()) {
      this.emailTransporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT) || 587,
        secure: Number(env.SMTP_PORT) === 465,
        auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
      });
      this.logger.log('SMTP transporter initialized for OTP emails.');
    }
  }

  /**
   * Rejects a dispatch inside the cooldown window.
   *
   * Throws 429 carrying the exact seconds remaining, so the client can render a
   * countdown instead of a flat "try again later". The filter turns
   * `retryAfterSeconds` into the standard `Retry-After` header.
   */
  assertCooldown(lastOtpSentAt: Date | null): void {
    if (!lastOtpSentAt) return;

    const elapsedSeconds = (Date.now() - lastOtpSentAt.getTime()) / 1000;
    const remaining = Math.ceil(OTP_COOLDOWN_SECONDS - elapsedSeconds);
    if (remaining <= 0) return;

    throw new HttpException(
      {
        message: `Please wait ${remaining} second${remaining === 1 ? '' : 's'} before requesting another code.`,
        retryAfterSeconds: remaining,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Sends an OTP and stamps `lastOtpSentAt`.
   *
   * Every dispatch path goes through this rather than `send()` directly, so the
   * cooldown always has something to measure against.
   */
  async dispatchForUser(
    userId: string,
    channel: OtpChannel,
    destination: string,
    purpose: OtpPurpose = 'AUTH',
  ): Promise<OtpDispatchResult> {
    const result = await this.send(channel, destination);
    await this.prisma.user.update({
      where: { id: userId },
      data: { [COOLDOWN_FIELD[purpose]]: new Date() },
    });
    return result;
  }

  /**
   * Dispatches an OTP for a channel.
   *
   * PHONE → Twilio Verify. EMAIL → a cryptographically generated 6-digit code
   * stored in Redis (TTL 10 minutes, max 5 verify attempts) and emailed via
   * SMTP. Without a provider in development the dummy code is returned in the
   * response; in production a missing provider throws 503 — it never
   * silently downgrades to an insecure path.
   */
  async send(
    channel: OtpChannel,
    destination: string,
  ): Promise<OtpDispatchResult> {
    if (channel === 'EMAIL') {
      if (isSmtpConfigured()) {
        return this.sendEmailOtp(destination);
      }
      return this.developmentFallback(
        'email',
        'Email delivery is not configured, so no email was sent.',
      );
    }

    if (isTwilioConfigured()) {
      try {
        const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
        await client.verify.v2
          .services(env.TWILIO_VERIFY_SERVICE_SID!)
          .verifications.create({ to: destination, channel: 'sms' });
        return {
          sent: true,
          message: `We sent a verification code to ${this.mask(destination)}. It expires shortly — enter it to continue.`,
        };
      } catch (error) {
        // Provider configured but the call failed: surface a real error rather
        // than pretending a code is on its way (the old fallback hid this).
        if (env.IS_PRODUCTION) {
          this.logger.error(
            `Twilio Verify dispatch failed: ${(error as Error)?.message}`,
          );
          throw new HttpException(
            'Could not send the verification SMS right now. Please try again in a moment.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        this.logger.warn(
          `Twilio Verify dispatch failed: ${(error as Error)?.message}. Falling back to development code.`,
        );
        return {
          sent: true,
          message:
            'Twilio Verify could not be reached, so no SMS was sent. Development code below.',
          otp: DUMMY_OTP,
        };
      }
    }

    return this.developmentFallback(
      'SMS',
      'SMS delivery is not configured, so no SMS was sent.',
    );
  }

  /**
   * Checks an OTP for a channel.
   *
   * PHONE → Twilio Verify checks. EMAIL → comparison against the hashed code
   * stored in Redis. The dummy code is accepted only when the channel's
   * provider is missing AND the app is not in production; with a provider
   * configured it is rejected even locally.
   */
  async verify(
    channel: OtpChannel,
    destination: string,
    otp: string,
  ): Promise<boolean> {
    const providerConfigured =
      channel === 'EMAIL' ? isSmtpConfigured() : isTwilioConfigured();

    if (otp === DUMMY_OTP) {
      if (!providerConfigured && !env.IS_PRODUCTION) {
        return true;
      }
      // Provider configured (or production): the dummy code proves nothing.
      return false;
    }

    if (channel === 'PHONE') {
      if (!isTwilioConfigured()) return false;
      try {
        const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
        const check = await client.verify.v2
          .services(env.TWILIO_VERIFY_SERVICE_SID!)
          .verificationChecks.create({ to: destination, code: otp });
        return check.status === 'approved';
      } catch (error) {
        this.logger.warn(
          `Twilio Verify check failed: ${(error as Error)?.message}`,
        );
        return false;
      }
    }

    if (!isSmtpConfigured()) return false;
    return this.verifyEmailOtp(destination, otp);
  }

  /**
   * Generates a 6-digit code, stores it in Redis and emails it.
   * The response never carries the code — only the delivery confirmation.
   */
  private async sendEmailOtp(destination: string): Promise<OtpDispatchResult> {
    const code = String(randomInt(100_000, 1_000_000));
    const redis = this.getRedis();

    if (!redis) {
      // Redis is required to store email codes; without it the code could
      // never be verified, so fail the same way as a missing provider.
      if (env.IS_PRODUCTION) {
        throw new HttpException(
          'Email verification is temporarily unavailable. Please try again in a moment.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      this.logger.warn(
        'REDIS_URL is not set — cannot store email OTP. Falling back to development code.',
      );
      return {
        sent: true,
        message:
          'Redis is not configured, so the code cannot be stored. Development code below.',
        otp: DUMMY_OTP,
      };
    }

    const key = this.otpKey(destination);
    try {
      // Separate awaits: ioredis chains only inside multi(); on the client
      // itself each command is its own promise.
      await redis.hset(key, {
        code: this.hashCode(destination, code),
        attempts: 0,
      });
      await redis.expire(key, EMAIL_OTP_TTL_SECONDS);

      await this.emailTransporter!.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to: destination,
        subject: 'Your 48Date verification code',
        text: `Your 48Date verification code is ${code}. It expires in ${EMAIL_OTP_TTL_SECONDS / 60} minutes. If you did not request it, you can safely ignore this email.`,
        html: `<p>Your <strong>48Date</strong> verification code is:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:bold">${code}</p>
<p>It expires in ${EMAIL_OTP_TTL_SECONDS / 60} minutes. If you did not request it, you can safely ignore this email.</p>`,
      });
    } catch (error) {
      await redis.del(key).catch(() => {});
      this.logger.error(
        `Email OTP dispatch failed: ${(error as Error)?.message}`,
      );
      throw new HttpException(
        'Could not send the verification email right now. Please try again in a moment.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      sent: true,
      message: `We sent a 6-digit code to ${this.mask(destination)}. It expires in ${EMAIL_OTP_TTL_SECONDS / 60} minutes.`,
    };
  }

  /**
   * Constant-shape comparison against the stored hash. Counts attempts and
   * invalidates the code after too many tries, so a leaked code cannot be
   * brute-forced at leisure.
   */
  private async verifyEmailOtp(
    destination: string,
    otp: string,
  ): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) return false;

    const key = this.otpKey(destination);
    const record = await redis.hgetall(key);
    if (!record || !record.code) return false;

    if (Number(record.attempts) >= EMAIL_OTP_MAX_ATTEMPTS) {
      await redis.del(key).catch(() => {});
      return false;
    }

    const matches = this.hashCode(destination, otp) === record.code;
    if (matches) {
      await redis.del(key).catch(() => {});
      return true;
    }

    await redis.hincrby(key, 'attempts', 1);
    await redis.expire(key, EMAIL_OTP_TTL_SECONDS);
    return false;
  }

  /**
   * The development fallback: reachable only outside production with no
   * provider configured. In production this same situation throws 503.
   */
  private developmentFallback(
    provider: string,
    reason: string,
  ): OtpDispatchResult {
    if (env.IS_PRODUCTION) {
      throw new HttpException(
        `${provider} verification is temporarily unavailable. Please try again later.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    this.logger.warn(
      `${reason} Falling back to the development code (${DUMMY_OTP}).`,
    );
    return {
      sent: true,
      message: `Development mode: ${reason} Use the code below to continue. (Set the ${provider === 'SMS' ? 'Twilio' : 'SMTP'} credentials to switch to real delivery.)`,
      otp: DUMMY_OTP,
    };
  }

  /** Redis keys are hashed so raw phone numbers/emails never sit in key names. */
  private otpKey(destination: string): string {
    return `otp:contact:${createHash('sha256').update(destination).digest('hex')}`;
  }

  /**
   * The stored value is a hash of (destination + code), so a Redis read alone
   * does not reveal a usable code, and codes remain bound to their destination.
   */
  private hashCode(destination: string, code: string): string {
    return createHash('sha256').update(`${destination}:${code}`).digest('hex');
  }

  /** PII-friendly display: +8801****001 / a***b@gmail.com */
  private mask(destination: string): string {
    if (destination.includes('@')) {
      const [local, domain] = destination.split('@');
      const head = local.slice(0, Math.min(1, local.length));
      const tail = local.slice(-1) === head ? '' : local.slice(-1);
      return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}${tail}@${domain}`;
    }
    if (destination.length <= 4) return destination;
    return `${destination.slice(0, 4)}${'*'.repeat(destination.length - 7)}${destination.slice(-3)}`;
  }

  private getRedis(): Redis | null {
    if (!env.REDIS_URL) return null;
    if (!this.redisClient) {
      this.redisClient = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        lazyConnect: false,
      });
      this.redisClient.on('error', (err) => {
        this.logger.warn(`OTP Redis error: ${err.message}`);
      });
    }
    return this.redisClient;
  }
}
