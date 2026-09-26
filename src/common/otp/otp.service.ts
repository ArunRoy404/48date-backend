import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import twilio from 'twilio';
import { PrismaService } from '../prisma/prisma.service.js';
import { env } from '../../config/env.config.js';

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
  /** Present only while no real provider is configured. */
  otp?: string;
}

/** Development fallback accepted whenever no provider is configured. */
export const DUMMY_OTP = '123456';

/**
 * How long a user must wait between OTP dispatches, across every endpoint that
 * sends one. Without it, a user leaning on "resend" burns SMS credit and anyone
 * can spam a stranger's phone for free.
 */
export const OTP_COOLDOWN_SECONDS = 30;

/**
 * Every OTP in the system goes through here — login, resend, and the profile
 * contact-verification flow.
 *
 * Centralised so the Twilio wiring, the dummy-code fallback and the cooldown
 * exist once. A second copy would inevitably drift, and a drifted cooldown is a
 * rate limit with a hole in it.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * Dispatches via Twilio Verify when it is configured, otherwise returns the
   * development dummy code.
   *
   * Email has no provider wired up at all — `SMTP_*` is unused — so an email
   * OTP is always the dummy code today. That is deliberate and documented
   * rather than silently pretending to send something.
   */
  async send(
    channel: OtpChannel,
    destination: string,
  ): Promise<OtpDispatchResult> {
    if (channel === 'EMAIL') {
      return {
        sent: true,
        message:
          'Development mode: dummy OTP active (no email provider configured)',
        otp: DUMMY_OTP,
      };
    }

    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;

    if (accountSid && authToken && serviceSid) {
      try {
        const client = twilio(accountSid, authToken);
        await client.verify.v2.services(serviceSid).verifications.create({
          to: destination,
          channel: 'sms',
        });
        return { sent: true, message: 'OTP sent via SMS' };
      } catch (error) {
        this.logger.warn(
          `Twilio Verify dispatch failed: ${(error as Error)?.message}. Falling back to dev OTP.`,
        );
        return {
          sent: true,
          message: 'Twilio Verify unavailable, using development dummy OTP',
          otp: DUMMY_OTP,
        };
      }
    }

    return {
      sent: true,
      message: 'Development mode: dummy OTP active',
      otp: DUMMY_OTP,
    };
  }

  /**
   * Checks an OTP against Twilio Verify, or the dummy code when no provider is
   * configured.
   *
   * NOTE: the dummy code is accepted before Twilio is consulted and there is no
   * environment guard, so `123456` verifies anything even in production. That
   * predates this refactor and is tracked in the README's Known gaps.
   */
  async verify(
    channel: OtpChannel,
    destination: string,
    otp: string,
  ): Promise<boolean> {
    if (otp === DUMMY_OTP) return true;

    // Email has no provider, so the dummy code above is the only valid path.
    if (channel === 'EMAIL') return false;

    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;

    if (accountSid && authToken && serviceSid) {
      try {
        const client = twilio(accountSid, authToken);
        const check = await client.verify.v2
          .services(serviceSid)
          .verificationChecks.create({ to: destination, code: otp });
        return check.status === 'approved';
      } catch (error) {
        this.logger.warn(
          `Twilio Verify check failed: ${(error as Error)?.message}`,
        );
        return false;
      }
    }

    return false;
  }
}
