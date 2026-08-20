import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OtpChannelDto } from './dto/otp-channel.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RequestOtpDto } from './dto/request-otp.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyForgotPasswordDto } from './dto/verify-forgot-password.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';

const DUMMY_OTP = '123456';
const RESET_TOKEN_PURPOSE = 'password-reset';

@Injectable()
export class AuthService {
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

  async login(dto: LoginDto) {
    if (!dto.phone && !dto.email) {
      throw new BadRequestException('Either phone or email must be provided');
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
    return { user: formatUser(user), ...tokens };
  }

  /**
   * Dummy OTP for development — returns a fixed code without checking the
   * account exists (avoids leaking which accounts are registered).
   * TODO: replace with Twilio Verify (phone) + transactional email (email).
   */
  requestOtp(dto: RequestOtpDto) {
    return {
      channel: dto.channel,
      otp: DUMMY_OTP,
      message: 'Dummy OTP — development only, no message was sent',
    };
  }

  /** Verifies an OTP and flips the matching verification flag on the account. */
  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.findByChannel(dto);
    if (!user) {
      throw new NotFoundException(`No account found with this ${dto.channel}`);
    }
    if (dto.otp !== DUMMY_OTP) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.channel === 'email'
          ? { isEmailVerified: true }
          : { isPhoneVerified: true }),
        // Keeps user profile verification false until full profile setup is completed.
        isUserVerified: false,
      },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    const tokens = await this.issueTokens(updated.id, updated.role);
    return { user: formatUser(updated), verified: true, ...tokens };
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
    const user = await this.findByChannel(dto);
    if (!user) {
      throw new NotFoundException(`No account found with this ${dto.channel}`);
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

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return formatUser(user);
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
  private async findByChannel(dto: OtpChannelDto) {
    return dto.channel === 'email'
      ? this.prisma.user.findUnique({ where: { email: dto.email! } })
      : this.prisma.user.findUnique({ where: { phone: dto.phone! } });
  }

  async googleLogin(dto: GoogleLoginDto) {
    let email: string;
    let name: string;

    try {
      // Decode the JWT token payload without signature verification (simple & zero dependencies in dev/mock)
      const payloadBase64 = dto.idToken.split('.')[1];
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString(
        'utf-8',
      );
      const payload = JSON.parse(payloadJson) as {
        email: string;
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

    let user = await this.prisma.user.findUnique({
      where: { email },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
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
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          lastLoginAt: new Date(),
        },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      });
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: formatUser(user), ...tokens };
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
