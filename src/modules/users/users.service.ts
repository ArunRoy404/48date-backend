import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import { SetupProfileDto } from './dto/setup-profile.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

    if (dto.name !== undefined) updateData.name = dto.name;
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

    if (dto.locations !== undefined) updateData.locations = dto.locations;
    if (dto.lastLocation !== undefined)
      updateData.lastLocation = dto.lastLocation;
    if (dto.latitude !== undefined) updateData.latitude = dto.latitude;
    if (dto.longitude !== undefined) updateData.longitude = dto.longitude;

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
    const hasName =
      updatedUser.name || (updatedUser.firstName && updatedUser.lastName);
    const isProfileComplete = !!(
      hasName &&
      updatedUser.username &&
      updatedUser.birthDate &&
      updatedUser.gender &&
      updatedUser.interestedIn &&
      updatedUser.lookingFor &&
      updatedUser.locations.length > 0 &&
      updatedUser.images.length > 0
    );

    if (isProfileComplete && !updatedUser.isUserVerified) {
      updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { isUserVerified: true },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      });
    }

    return formatUser(updatedUser);
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
