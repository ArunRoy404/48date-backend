/// <reference types="multer" />
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { FaceVerificationService } from './face-verification.service.js';
import { VerifySelfieDto } from './dto/verify-selfie.dto.js';

@Controller('face-verification')
@UseGuards(JwtAuthGuard)
export class FaceVerificationController {
  constructor(
    private readonly faceVerificationService: FaceVerificationService,
  ) {}

  @Post('verify')
  @UseInterceptors(AnyFilesInterceptor())
  async verifySelfie(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() dto: VerifySelfieDto,
    @Req() req: Request,
  ) {
    const file = files && files.length > 0 ? files[0] : undefined;
    const data = await this.faceVerificationService.verifySelfie(
      req.user!.userId,
      file,
      dto?.selfieUrl,
    );
    return successResponse(data, 'Selfie verified successfully');
  }

  @Get('status')
  async getStatus(@Req() req: Request) {
    const data = await this.faceVerificationService.getStatus(req.user!.userId);
    return successResponse(data, 'Verification status fetched successfully');
  }
}