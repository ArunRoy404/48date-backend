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
import { PrismaService } from '../common/prisma/prisma.service.js';
import { formatUser } from '../common/utils/user-formatter.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OtpChannelDto } from './dto/otp-channel.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RequestOtpDto } from './dto/request-otp.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyForgotPasswordDto } from './dto/verify-forgot-password.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';

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
    const mainImages = dto.images.filter((image) => image.isMain);
    if (mainImages.length !== 1) {
      throw new BadRequestException('Exactly one image must be marked as main');
    }

    const birthDate = new Date(dto.birthDate);
    if (Number.isNaN(birthDate.getTime()) || birthDate.getTime() > Date.now()) {
      throw new BadRequestException(
        'birthDate must be a valid date in the past',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user
      .create({
        data: {
          // Auth / identity
          phone: dto.phone,
          email: dto.email,
          passwordHash,
          // Basic profile
          name: dto.name,
          firstName: dto.firstName,
          lastName: dto.lastName,
          username: dto.username,
          birthDate,
          occupation: dto.occupation,
          gender: dto.gender,
          interestedIn: dto.interestedIn,
          // Lifestyle
          smoker: dto.smoker,
          alcohol: dto.alcohol,
          kids: dto.kids,
          wantsKids: dto.wantsKids,
          lookingFor: dto.lookingFor,
          // Location
          locations: dto.locations,
          lastLocation: dto.lastLocation,
          // Body
          heightCm: dto.heightCm,
          weightKg: dto.weightKg,
          // Interests
          creativity: dto.creativity,
          sports: dto.sports,
          moviesAndDramas: dto.moviesAndDramas,
          // Media
          selfieUrl: dto.selfieUrl,
          notificationsEnabled: dto.notificationsEnabled,
          images: {
            create: dto.images.map((image, index) => ({
              url: image.url,
              isMain: image.isMain,
              sortOrder: image.sortOrder ?? index,
            })),
          },
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
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
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
        // Verified if any one of email / phone is confirmed.
        isUserVerified: true,
      },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    return { user: formatUser(updated), verified: true };
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
