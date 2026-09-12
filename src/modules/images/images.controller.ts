/// <reference types="multer" />
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { ImagesService } from './images.service.js';

@Controller('images')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('upload')
  @UseInterceptors(AnyFilesInterceptor())
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No file provided for upload.');
    }
    const data = await this.imagesService.uploadImages(files, req.user!.userId);
    const message =
      files.length > 1
        ? `${files.length} images uploaded successfully`
        : 'Image uploaded successfully';
    return successResponse(data, message);
  }
}
