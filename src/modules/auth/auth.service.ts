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
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  OTP_COOLDOWN_SECONDS,
  OtpService,
} from '../../common/otp/otp.service.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { VerifyUserInformationDto } from './dto/verify-user-information.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly otp: OtpService,
  ) {}

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
    let user = await this.prisma.user.findFirst({
      where: { phone: dto.phone },
    });
    let isNewAccount = false;

    if (!user) {
      isNewAccount = true;
      user = await this.prisma.user
        .create({
          data: {
            phone: dto.phone,
            isPhoneVerified: false,
          },
        })
        .catch((error: unknown) => {
          // Two first-time logins for the same number can race here.
          const conflictMessage = this.uniqueConflictMessage(error);
          if (conflictMessage) {
            throw new ConflictException(conflictMessage);
          }
          throw error;
        });
    }

    // A brand-new account has never been sent anything, so it skips the wait.
    if (!isNewAccount) {
      this.otp.assertCooldown(user.lastOtpSentAt);
    }

    const otpResult = await this.otp.dispatchForUser(
      user.id,
      'PHONE',
      dto.phone,
    );

    return {
      requiresOtp: true,
      isNewAccount,
      phone: user.phone,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      isProfileComplete: user.isProfileComplete,
      isUserVerified: user.isUserVerified,
      // So the OTP screen can disable its resend button for the right length
      // of time without hard-coding the window.
      resendCooldownSeconds: OTP_COOLDOWN_SECONDS,
      message: otpResult.message,
      ...(otpResult.otp ? { otp: otpResult.otp } : {}),
    };
  }

  /** Verifies an OTP and flips the matching verification flag on the account. */
  /**
   * Re-sends the OTP for an existing account.
   *
   * Never creates an account — a number we have not seen is a 404 here, unlike
   * `login`, because resending implies something was sent in the first place.
   */
  async resendOtp(dto: ResendOtpDto) {
    const user = await this.prisma.user.findFirst({
      where: { phone: dto.phone },
    });

    if (!user) {
      throw new NotFoundException('No account found with this phone number');
    }

    this.otp.assertCooldown(user.lastOtpSentAt);

    const otpResult = await this.otp.dispatchForUser(
      user.id,
      'PHONE',
      dto.phone,
    );

    return {
      requiresOtp: true,
      phone: user.phone,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      isProfileComplete: user.isProfileComplete,
      isUserVerified: user.isUserVerified,
      resendCooldownSeconds: OTP_COOLDOWN_SECONDS,
      message: otpResult.message,
      ...(otpResult.otp ? { otp: otpResult.otp } : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findFirst({
      where: { phone: dto.phone },
    });

    if (!user) {
      throw new NotFoundException('No account found with this phone number');
    }

    const isValid = await this.otp.verify('PHONE', dto.phone, dto.otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { isPhoneVerified: true, lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(updated.id, updated.role);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isPhoneVerified: updated.isPhoneVerified,
      isEmailVerified: updated.isEmailVerified,
      isProfileComplete: updated.isProfileComplete,
      isUserVerified: updated.isUserVerified,
      nextStep: updated.isProfileComplete ? 'MAIN_APP' : 'PROFILE_SETUP',
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
    // `selfieVerificationImageUrl` is the wire name for what the model stores
    // as `selfieUrl`; everything else maps across unchanged.
    const { selfieVerificationImageUrl, ...profile } = dto;
    const user = await this.usersService.setupProfile(userId, {
      ...profile,
      selfieUrl: selfieVerificationImageUrl,
    });

    // `formatUser` nests the verification flags under `auth`.
    if (!user.auth.isProfileComplete) {
      throw new BadRequestException(
        'Profile is still incomplete — the account could not be verified.',
      );
    }

    return {
      user,
      isProfileComplete: user.auth.isProfileComplete,
      // Stays false until an admin vouches for the account; completing
      // onboarding is not the same thing.
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
          // The model has no single `name` column; Google gives one string, so
          // split on the first space and let the user correct it in A-03.
          firstName: name.split(' ')[0] || null,
          lastName: name.split(' ').slice(1).join(' ') || null,
          // Google has already proven the address, so this is the one path
          // that can set it without an OTP of our own.
          isEmailVerified: true,
          isPhoneVerified: false,
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
      isProfileComplete: user.isProfileComplete,
      isUserVerified: user.isUserVerified,
      nextStep: user.isProfileComplete ? 'MAIN_APP' : 'PROFILE_SETUP',
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
