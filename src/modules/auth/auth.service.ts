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
import * as bcrypt from 'bcrypt';
import twilio from 'twilio';
import { env } from '../../config/env.config.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyForgotPasswordDto } from './dto/verify-forgot-password.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';

const DUMMY_OTP = '123456';
const RESET_TOKEN_PURPOSE = 'password-reset';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    if (!dto.phone && !dto.email) {
      throw new BadRequestException('Either phone or email must be provided');
    }

    if (dto.images && dto.images.length > 0) {
      const mainImages = dto.images.filter((image) => image.isMain);
      if (mainImages.length !== 1) {
        throw new BadRequestException(
          'Exactly one image must be marked as main',
        );
      }
    }

    let birthDate: Date | undefined = undefined;
    if (dto.birthDate) {
      birthDate = new Date(dto.birthDate);
      if (
        Number.isNaN(birthDate.getTime()) ||
        birthDate.getTime() > Date.now()
      ) {
        throw new BadRequestException(
          'birthDate must be a valid date in the past',
        );
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user
      .create({
        data: {
          // Auth / identity
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          passwordHash,
          // Basic profile
          name: dto.name ?? null,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          username: dto.username ?? null,
          birthDate,
          occupation: dto.occupation ?? null,
          gender: dto.gender ?? null,
          interestedIn: dto.interestedIn ?? null,
          // Lifestyle
          smoker: dto.smoker ?? null,
          alcohol: dto.alcohol ?? null,
          kids: dto.kids ?? null,
          wantsKids: dto.wantsKids ?? null,
          lookingFor: dto.lookingFor ?? null,
          // Location
          locations: dto.locations ?? [],
          lastLocation: dto.lastLocation ?? null,
          // Body
          heightCm: dto.heightCm ?? null,
          weightKg: dto.weightKg ?? null,
          // Interests
          creativity: dto.creativity ?? [],
          sports: dto.sports ?? [],
          moviesAndDramas: dto.moviesAndDramas ?? [],
          // Media
          selfieUrl: dto.selfieUrl ?? null,
          notificationsEnabled: dto.notificationsEnabled ?? true,
          images:
            dto.images && dto.images.length > 0
              ? {
                  create: dto.images.map((image, index) => ({
                    r2Key: image.url,
                    isPrimary: image.isMain,
                    sortOrder: image.sortOrder ?? index,
                  })),
                }
              : undefined,
        },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      })
      .catch((error: unknown) => {
        const conflictMessage = this.uniqueConflictMessage(error);
        if (conflictMessage) {
          throw new ConflictException(conflictMessage);
        }
        throw error;
      });

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: formatUser(user), ...tokens };
  }

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
   * Unified login & sign-in handler:
   * - If phone is supplied without password, automatically finds or creates the user.
   *   If phone is unverified, sends OTP. If verified, returns tokens and routing step.
   * - If password is supplied (e.g. email or admin login), verifies credentials with bcrypt.
   */
  async login(dto: LoginDto) {
    if (!dto.phone && !dto.email) {
      throw new BadRequestException('Either phone or email must be provided');
    }

    // --- Phone-based passwordless login & auto-create flow ---
    if (dto.phone && !dto.password) {
      let user = await this.prisma.user.findFirst({
        where: { phone: dto.phone },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            phone: dto.phone,
            isPhoneVerified: false,
            isUserVerified: false,
          },
        });
      }

      if (!user.isPhoneVerified) {
        const otpResult = await this.sendOtp(dto.phone);
        return {
          requiresOtp: true,
          phone: user.phone,
          isPhoneVerified: false,
          isUserVerified: false,
          message: otpResult.message,
          ...(otpResult.otp ? { otp: otpResult.otp } : {}),
        };
      }

      // Phone is verified -> issue tokens and direct to main app or profile setup
      const tokens = await this.issueTokens(user.id, user.role);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        requiresOtp: false,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isPhoneVerified: true,
        isEmailVerified: user.isEmailVerified,
        isUserVerified: user.isUserVerified,
        nextStep: user.isUserVerified ? 'MAIN_APP' : 'PROFILE_SETUP',
      };
    }

    // --- Password-based login (e.g. email or admin account) ---
    if (!dto.password) {
      throw new BadRequestException('Password is required for email login');
    }

    const user = await this.prisma.user.findFirst({
      where: dto.phone ? { phone: dto.phone } : { email: dto.email },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, user.role);
    return {
      requiresOtp: false,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      isUserVerified: user.isUserVerified,
      nextStep: user.isUserVerified ? 'MAIN_APP' : 'PROFILE_SETUP',
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
   * Dummy OTP for password reset — same fixed code, no account enumeration.
   * TODO: replace with Twilio Verify (phone) + transactional email (email).
   */
  forgotPassword(dto: ForgotPasswordDto) {
    return {
      channel: dto.channel,
      otp: DUMMY_OTP,
      message: 'Dummy OTP — development only, no message was sent',
    };
  }

  /** Verifies the reset OTP and issues a short-lived password-reset token. */
  async verifyForgotPassword(dto: VerifyForgotPasswordDto) {
    const channel = dto.channel || (dto.phone ? 'phone' : 'email');
    const user = await this.findByChannel(dto);
    if (!user) {
      throw new NotFoundException(`No account found with this ${channel}`);
    }
    if (dto.otp !== DUMMY_OTP) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const resetToken = await this.jwtService.signAsync(
      { sub: user.id, purpose: RESET_TOKEN_PURPOSE },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );

    return { resetToken, expiresIn: '15m' };
  }

  /** Sets a new password using a valid reset token. */
  async resetPassword(dto: ResetPasswordDto) {
    let payload: { sub: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.resetToken, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    if (payload.purpose !== RESET_TOKEN_PURPOSE) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new NotFoundException('User no longer exists');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return { message: 'Password updated successfully' };
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
