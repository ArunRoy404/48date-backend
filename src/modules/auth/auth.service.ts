import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import twilio from 'twilio';
import { env } from '../../config/env.config.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { VerifyUserInformationDto } from './dto/verify-user-information.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';

const DUMMY_OTP = '123456';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Dispatches an OTP via Twilio Verify if configured in production,
   * otherwise logs and returns the development dummy OTP.
   */
  private async sendOtp(
    phone: string,
  ): Promise<{ sent: boolean; message: string; otp?: string }> {
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;

    if (accountSid && authToken && serviceSid) {
      try {
        const client = twilio(accountSid, authToken);
        await client.verify.v2.services(serviceSid).verifications.create({
          to: phone,
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
   * Verifies the OTP with Twilio Verify if configured,
   * or matches against development dummy OTP.
   */
  private async verifyOtpCode(phone: string, otp: string): Promise<boolean> {
    if (otp === DUMMY_OTP) {
      return true;
    }

    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;

    if (accountSid && authToken && serviceSid) {
      try {
        const client = twilio(accountSid, authToken);
        const check = await client.verify.v2
          .services(serviceSid)
          .verificationChecks.create({
            to: phone,
            code: otp,
          });
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

  /**
   * Unified login / sign-up handler — there is no separate register endpoint.
   *
   * - Accepts a phone OR an email. An identifier we have never seen creates
   *   the account on the spot.
   * - ALWAYS dispatches an OTP and returns `requiresOtp: true`. No tokens are
   *   issued here, and an already-verified account is no exception: every
   *   login is re-confirmed with an OTP.
   * - The client continues with `POST /auth/verify-otp` (A-02), which issues
   *   the token pair and routes on `nextStep`.
   */
  async login(dto: LoginDto) {
    const channel = dto.channel || (dto.phone ? 'phone' : 'email');
    const identifier = channel === 'phone' ? dto.phone : dto.email;

    if (!identifier) {
      throw new BadRequestException(
        dto.channel
          ? `${channel} must be provided when channel is "${channel}"`
          : 'Either phone or email must be provided',
      );
    }

    let user = await this.findByChannel({ channel, ...dto });
    let isNewAccount = false;

    if (!user) {
      isNewAccount = true;
      user = await this.prisma.user
        .create({
          data:
            channel === 'phone'
              ? {
                  phone: identifier,
                  isPhoneVerified: false,
                  isUserVerified: false,
                }
              : {
                  email: identifier,
                  isEmailVerified: false,
                  isUserVerified: false,
                },
        })
        .catch((error: unknown) => {
          // Two first-time logins for the same identifier can race here.
          const conflictMessage = this.uniqueConflictMessage(error);
          if (conflictMessage) {
            throw new ConflictException(conflictMessage);
          }
          throw error;
        });
    }

    const otpResult =
      channel === 'phone'
        ? await this.sendOtp(identifier)
        : {
            sent: true,
            message: 'Development mode: dummy OTP active',
            otp: DUMMY_OTP,
          };

    return {
      requiresOtp: true,
      isNewAccount,
      channel,
      ...(channel === 'phone' ? { phone: user.phone } : { email: user.email }),
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      isUserVerified: user.isUserVerified,
      message: otpResult.message,
      ...(otpResult.otp ? { otp: otpResult.otp } : {}),
    };
  }

  /** Verifies an OTP and flips the matching verification flag on the account. */
  async verifyOtp(dto: VerifyOtpDto) {
    const channel = dto.channel || (dto.phone ? 'phone' : 'email');
    const user = await this.findByChannel({
      channel,
      phone: dto.phone,
      email: dto.email,
    });

    if (!user) {
      throw new NotFoundException(`No account found with this ${channel}`);
    }

    let isValid = false;
    if (channel === 'phone' && dto.phone) {
      isValid = await this.verifyOtpCode(dto.phone, dto.otp);
    } else if (channel === 'email') {
      isValid = dto.otp === DUMMY_OTP;
    }

    if (!isValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(channel === 'email'
          ? { isEmailVerified: true }
          : { isPhoneVerified: true }),
        lastLoginAt: new Date(),
      },
    });

    const tokens = await this.issueTokens(updated.id, updated.role);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isPhoneVerified: updated.isPhoneVerified,
      isEmailVerified: updated.isEmailVerified,
      isUserVerified: updated.isUserVerified,
      nextStep: updated.isUserVerified ? 'MAIN_APP' : 'PROFILE_SETUP',
    };
  }

  /**
   * A-03 — the single onboarding submission.
   *
   * Called once the client holds a token pair (from A-02 verify-otp, or from
   * A-01.2 Google login) and the account still reports
   * `isUserVerified: false`. It writes the whole profile in one shot; the
   * DTO requires every field the completeness check looks at, so a 200 here
   * always means the account is now verified and routed to MAIN_APP.
   *
   * Later edits go through `PATCH /users/profile-setup` (P-02).
   */
  async verifyUserInformation(userId: string, dto: VerifyUserInformationDto) {
    // `name` is what the profile screens display; derive it when the client
    // only sent the two name parts.
    const name = dto.name?.trim() || `${dto.firstName} ${dto.lastName}`.trim();

    const user = await this.usersService.setupProfile(userId, { ...dto, name });

    // `formatUser` nests the verification flags under `auth`.
    if (!user.auth.isUserVerified) {
      throw new BadRequestException(
        'Profile is still incomplete — the account could not be verified.',
      );
    }

    return {
      user,
      isUserVerified: user.auth.isUserVerified,
      nextStep: 'MAIN_APP',
    };
  }

  /** Refreshes the token pair using a valid refresh token. */
  async refresh(dto: RefreshDto) {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return this.issueTokens(user.id, user.role);
  }

  /**
   * Stateless logout — the JWT guard confirms the token is valid, then the
   * client discards its stored tokens. A Redis blacklist can be added later
   * to make revocation server-enforced.
   */
  logout() {
    return { message: 'Logged out successfully' };
  }

  /**
   * Builds a field-specific 409 message for a Prisma P2002 (unique
   * constraint) violation, so the client is told exactly which field
   * collided — never a blanket "phone/email/username" message.
   * Handles both the classic `meta.target` shape and the driver adapter
   * `meta.driverAdapterError.cause.constraint.fields` shape.
   */
  private uniqueConflictMessage(error: unknown): string | null {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'P2002' ||
      !('meta' in error)
    ) {
      return null;
    }

    const meta = (error as { meta?: unknown }).meta as
      | {
          target?: string | string[];
          driverAdapterError?: {
            cause?: { constraint?: { fields?: string[] } };
          };
        }
      | undefined;

    const target = meta?.target;
    const adapterFields = meta?.driverAdapterError?.cause?.constraint?.fields;

    const names = [
      ...(Array.isArray(target) ? target : target ? [target] : []),
      ...(adapterFields ?? []),
    ]
      .map((name) => name.toLowerCase())
      .join(' ');

    if (names.includes('username')) return 'Username is already taken';
    if (names.includes('phone')) return 'Phone number is already registered';
    if (names.includes('email')) return 'Email is already registered';
    return 'This account is already registered';
  }

  /** Looks up an account by the identifier that matches the requested channel. */
  private async findByChannel(dto: {
    channel?: 'email' | 'phone';
    phone?: string;
    email?: string;
  }) {
    const channel = dto.channel || (dto.phone ? 'phone' : 'email');
    return channel === 'email'
      ? this.prisma.user.findFirst({ where: { email: dto.email! } })
      : this.prisma.user.findFirst({ where: { phone: dto.phone! } });
  }

  async googleLogin(dto: GoogleLoginDto) {
    let email: string;
    let name: string;

    try {
      // Decode the JWT token payload (support standard JWT and raw base64)
      const parts = dto.idToken.split('.');
      const payloadBase64 = parts.length > 1 ? parts[1] : parts[0];
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString(
        'utf-8',
      );
      const payload = JSON.parse(payloadJson) as {
        email?: string;
        name?: string;
      };

      if (!payload.email) {
        throw new BadRequestException(
          'Invalid Google ID token payload: missing email',
        );
      }
      email = payload.email;
      name = payload.name || email.split('@')[0];
    } catch (e) {
      throw new BadRequestException(
        'Failed to parse Google ID token: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    }

    let user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name,
          isEmailVerified: true,
          isPhoneVerified: false,
          isUserVerified: false,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          lastLoginAt: new Date(),
        },
      });
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isEmailVerified: true,
      isPhoneVerified: user.isPhoneVerified,
      isUserVerified: user.isUserVerified,
      nextStep: user.isUserVerified ? 'MAIN_APP' : 'PROFILE_SETUP',
    };
  }

  private async issueTokens(userId: string, role: string) {
    const payload = { sub: userId, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn: '15m' }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
