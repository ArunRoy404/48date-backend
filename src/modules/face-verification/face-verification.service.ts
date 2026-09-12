import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ImagesService } from '../images/images.service.js';

@Injectable()
export class FaceVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imagesService: ImagesService,
  ) {}

  /**
   * Verifies a user selfie:
   * - Uploads the selfie file to storage (or accepts existing selfieUrl)
   * - Marks selfieVerified: true
   * - Checks if the profile is complete, and if so, marks isUserVerified: true
   */
  async verifySelfie(
    userId: string,
    file?: Express.Multer.File,
    selfieUrl?: string,
  ) {
    let finalSelfieUrl: string | undefined = selfieUrl;

    if (file) {
      const uploadResult = await this.imagesService.uploadImage(file, userId);
      finalSelfieUrl = uploadResult.url;
    }

    if (!finalSelfieUrl) {
      throw new BadRequestException(
        'Please provide a selfie image file or selfieUrl.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { images: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if the user has completed required profile fields
    const hasName = user.name || (user.firstName && user.lastName);
    const isProfileComplete = !!(
      hasName &&
      user.username &&
      user.birthDate &&
      user.gender &&
      user.interestedIn &&
      user.lookingFor &&
      user.locations.length > 0 &&
      user.images.length > 0
    );

    const isUserVerified = isProfileComplete || user.isUserVerified;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        selfieUrl: finalSelfieUrl,
        selfieVerified: true,
        isUserVerified,
      },
    });

    return {
      selfieUrl: updated.selfieUrl,
      selfieVerified: updated.selfieVerified,
      isUserVerified: updated.isUserVerified,
      nextStep: updated.isUserVerified ? 'MAIN_APP' : 'PROFILE_SETUP',
    };
  }

  /**
   * Returns current verification status for the user.
   */
  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      selfieUrl: user.selfieUrl,
      selfieVerified: user.selfieVerified,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      isUserVerified: user.isUserVerified,
      nextStep: user.isUserVerified ? 'MAIN_APP' : 'PROFILE_SETUP',
    };
  }
}
