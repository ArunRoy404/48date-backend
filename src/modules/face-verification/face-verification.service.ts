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
   * - Recomputes `isProfileComplete`
   *
   * It does NOT touch `isUserVerified` — that is the admin's trust badge.
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
    const isProfileComplete = !!(
      user.firstName &&
      user.lastName &&
      user.username &&
      user.birthDate &&
      user.gender &&
      user.interestedIn &&
      user.lookingFor &&
      user.images.length > 0
    );

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        selfieUrl: finalSelfieUrl,
        selfieVerified: true,
        isProfileComplete,
      },
    });

    return {
      selfieUrl: updated.selfieUrl,
      selfieVerified: updated.selfieVerified,
      isProfileComplete: updated.isProfileComplete,
      isUserVerified: updated.isUserVerified,
      nextStep: updated.isProfileComplete ? 'MAIN_APP' : 'PROFILE_SETUP',
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
      isProfileComplete: user.isProfileComplete,
      isUserVerified: user.isUserVerified,
      nextStep: user.isProfileComplete ? 'MAIN_APP' : 'PROFILE_SETUP',
    };
  }
}
