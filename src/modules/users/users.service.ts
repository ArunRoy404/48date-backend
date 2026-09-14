import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  OTP_COOLDOWN_SECONDS,
  OtpService,
} from '../../common/otp/otp.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import { SetupProfileDto } from './dto/setup-profile.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import type {
  AddContactDto,
  ContactType,
  RequestContactOtpDto,
  VerifyContactOtpDto,
} from './dto/contact.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { LocationPermission } from '../../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
  ) {}

  /** Updates the user profile and updates verification state if profile becomes complete. */
  async setupProfile(userId: string, dto: SetupProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { images: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check unique username constraint manually
    if (dto.username && dto.username !== user.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existing) {
        throw new ConflictException('Username is already taken');
      }
    }

    // Validate birthDate
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

    // Validate images constraints if provided
    if (dto.images) {
      if (dto.images.length === 0) {
        throw new BadRequestException('Images list cannot be empty');
      }
      if (dto.images.length > 6) {
        throw new BadRequestException('Cannot have more than 6 profile images');
      }
      const primaryCount = dto.images.filter((img) => img.isMain).length;
      if (primaryCount !== 1) {
        throw new BadRequestException(
          'Exactly one image must be marked as main',
        );
      }
    }

    // Construct the update data object dynamically (PATCH updates)
    const updateData: Prisma.UserUpdateInput = {};

    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.username !== undefined) updateData.username = dto.username;
    if (birthDate !== undefined) updateData.birthDate = birthDate;
    if (dto.occupation !== undefined) updateData.occupation = dto.occupation;
    if (dto.gender !== undefined) updateData.gender = dto.gender;
    if (dto.interestedIn !== undefined)
      updateData.interestedIn = dto.interestedIn;

    if (dto.smoker !== undefined) updateData.smoker = dto.smoker;
    if (dto.alcohol !== undefined) updateData.alcohol = dto.alcohol;
    if (dto.kids !== undefined) updateData.kids = dto.kids;
    if (dto.wantsKids !== undefined) updateData.wantsKids = dto.wantsKids;
    if (dto.lookingFor !== undefined) updateData.lookingFor = dto.lookingFor;

    if (dto.lastLocation !== undefined)
      updateData.lastLocation = dto.lastLocation;
    if (dto.latitude !== undefined) updateData.latitude = dto.latitude;
    if (dto.longitude !== undefined) updateData.longitude = dto.longitude;
    // Any path that writes a coordinate has to stamp the time, or a fix from
    // onboarding stays indistinguishable from one taken this morning.
    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      updateData.locationUpdatedAt = new Date();
    }
    if (dto.locationPermission !== undefined)
      updateData.locationPermission = dto.locationPermission;

    if (dto.heightCm !== undefined) updateData.heightCm = dto.heightCm;
    if (dto.weightKg !== undefined) updateData.weightKg = dto.weightKg;

    if (dto.creativity !== undefined) updateData.creativity = dto.creativity;
    if (dto.sports !== undefined) updateData.sports = dto.sports;
    if (dto.moviesAndDramas !== undefined)
      updateData.moviesAndDramas = dto.moviesAndDramas;

    if (dto.selfieUrl !== undefined) updateData.selfieUrl = dto.selfieUrl;
    if (dto.notificationsEnabled !== undefined)
      updateData.notificationsEnabled = dto.notificationsEnabled;

    // Handle nested images update if provided
    if (dto.images) {
      updateData.images = {
        deleteMany: {},
        create: dto.images.map((img, index) => ({
          r2Key: img.url,
          isPrimary: img.isMain,
          sortOrder: img.sortOrder ?? index,
        })),
      };
    }

    // Execute core profile updates
    let updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    // Check if the profile is now complete to auto-verify
    const isProfileComplete = !!(
      updatedUser.firstName &&
      updatedUser.lastName &&
      updatedUser.username &&
      updatedUser.birthDate &&
      updatedUser.gender &&
      updatedUser.interestedIn &&
      updatedUser.lookingFor &&
      updatedUser.images.length > 0
    );

    // `isUserVerified` is deliberately untouched here — that is the admin's
    // trust badge, not something a user grants themselves by filling in a form.
    if (isProfileComplete !== updatedUser.isProfileComplete) {
      updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { isProfileComplete },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      });
    }

    return formatUser(updatedUser);
  }

  /**
   * Updates just the user's location.
   *
   * Two shapes are valid: a fresh fix (`latitude` + `longitude`, optionally
   * with `city` and `permission`), or a refusal (`permission` on its own, no
   * coordinates). `locationUpdatedAt` is stamped only when coordinates
   * actually change, so a permission-only call does not make a stale fix look
   * fresh.
   */
  async updateLocation(userId: string, dto: UpdateLocationDto) {
    const hasLatitude = dto.latitude !== undefined;
    const hasLongitude = dto.longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'latitude and longitude must be sent together',
      );
    }

    if (
      !hasLatitude &&
      dto.permission === undefined &&
      dto.city === undefined
    ) {
      throw new BadRequestException(
        'Send latitude and longitude, a city, or a permission value',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: Prisma.UserUpdateInput = {};

    if (hasLatitude && hasLongitude) {
      updateData.latitude = dto.latitude;
      updateData.longitude = dto.longitude;
      updateData.locationUpdatedAt = new Date();
    }

    if (dto.city !== undefined) {
      updateData.lastLocation = dto.city;
    }

    if (dto.permission !== undefined) {
      updateData.locationPermission = dto.permission;

      // A hard refusal invalidates whatever we were holding — continuing to
      // match on a coordinate the user has withdrawn consent for is not on.
      if (
        dto.permission === LocationPermission.DENIED ||
        dto.permission === LocationPermission.DENIED_FOREVER
      ) {
        updateData.latitude = null;
        updateData.longitude = null;
        updateData.locationUpdatedAt = null;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    return formatUser(updated);
  }

  /**
   * Adds or replaces the phone number or email on the signed-in account.
   *
   * Whatever is written lands **unverified** — even replacing an already
   * verified number resets the flag, because the new one has proven nothing.
   * Proving it is the separate request-otp / verify-otp pair below.
   */
  async addContact(userId: string, dto: AddContactDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPhone = dto.type === 'PHONE';

    // Both columns are unique, so check before writing to return a useful
    // message rather than a raw constraint violation.
    const taken = await this.prisma.user.findFirst({
      where: isPhone ? { phone: dto.value } : { email: dto.value },
      select: { id: true },
    });
    if (taken && taken.id !== userId) {
      throw new ConflictException(
        isPhone
          ? 'That phone number is already used by another account.'
          : 'That email address is already used by another account.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: isPhone
        ? { phone: dto.value, isPhoneVerified: false }
        : { email: dto.value, isEmailVerified: false },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    return {
      user: formatUser(updated),
      type: dto.type,
      value: dto.value,
      verified: false,
      message: `Saved. Send a code to confirm this ${isPhone ? 'number' : 'address'}.`,
    };
  }

  /** Reads the identifier a contact request refers to, or explains its absence. */
  private contactDestination(
    user: { phone: string | null; email: string | null },
    type: ContactType,
  ): string {
    const value = type === 'PHONE' ? user.phone : user.email;
    if (!value) {
      throw new BadRequestException(
        type === 'PHONE'
          ? 'Add a phone number first.'
          : 'Add an email address first.',
      );
    }
    return value;
  }

  /** Sends a verification code to the stored phone or email. */
  async requestContactOtp(userId: string, dto: RequestContactOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const destination = this.contactDestination(user, dto.type);

    const alreadyVerified =
      dto.type === 'PHONE' ? user.isPhoneVerified : user.isEmailVerified;
    if (alreadyVerified) {
      throw new BadRequestException(
        dto.type === 'PHONE'
          ? 'This phone number is already verified.'
          : 'This email address is already verified.',
      );
    }

    // Its own timer, not the login one: signing in should not block you from
    // verifying an email you added seconds later.
    this.otp.assertCooldown(user.lastContactOtpSentAt);

    const result = await this.otp.dispatchForUser(
      userId,
      dto.type,
      destination,
      'CONTACT',
    );

    return {
      type: dto.type,
      sentTo: destination,
      resendCooldownSeconds: OTP_COOLDOWN_SECONDS,
      message: result.message,
      ...(result.otp ? { otp: result.otp } : {}),
    };
  }

  /** Confirms the code and flips the matching verification flag. */
  async verifyContactOtp(userId: string, dto: VerifyContactOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const destination = this.contactDestination(user, dto.type);

    const isValid = await this.otp.verify(dto.type, destination, dto.otp);
    if (!isValid) {
      throw new UnauthorizedException('That code is not correct.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data:
        dto.type === 'PHONE'
          ? { isPhoneVerified: true }
          : { isEmailVerified: true },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    return {
      user: formatUser(updated),
      type: dto.type,
      verified: true,
      isPhoneVerified: updated.isPhoneVerified,
      isEmailVerified: updated.isEmailVerified,
    };
  }

  /** Fetches a user profile. */
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
}
