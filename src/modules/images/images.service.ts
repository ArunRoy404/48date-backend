import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../config/env.config.js';
import type { ImageUploadResponse } from './types/images.types.js';

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);
  private readonly s3Client?: S3Client;
  private readonly bucketName?: string;

  constructor() {
    const accountId = env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    const bucket = env.R2_BUCKET;

    if (accountId && accessKeyId && secretAccessKey && bucket) {
      this.bucketName = bucket;
      this.s3Client = new S3Client({
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        region: 'auto',
      });
      this.logger.log('Cloudflare R2 storage client initialized successfully.');
    } else {
      this.logger.warn(
        'Cloudflare R2 environment variables are not fully configured. Falling back to local storage.',
      );
    }
  }

  async uploadImage(
    file: Express.Multer.File,
    userId: string,
  ): Promise<ImageUploadResponse> {
    if (!file) {
      throw new BadRequestException('No file provided for upload.');
    }

    // Basic file validation
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed. Received: ${file.mimetype}`,
      );
    }

    // Limit size to 10MB
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds the 10MB limit.');
    }

    const fileExt = file.originalname.split('.').pop() || 'png';
    const filename = `${crypto.randomUUID()}-${Date.now()}.${fileExt}`;

    if (this.s3Client && this.bucketName) {
      const key = `users/${userId}/images/${filename}`;
      try {
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        });

        await this.s3Client.send(command);

        const url = `https://${this.bucketName}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
        return { url, key };
      } catch (error) {
        this.logger.error(
          `Failed to upload image to Cloudflare R2: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw new BadRequestException(
          'Failed to upload image to storage provider.',
        );
      }
    } else {
      // Local fallback
      try {
        const uploadDir = join(process.cwd(), 'uploads');
        await fs.mkdir(uploadDir, { recursive: true });

        const localPath = join(uploadDir, filename);
        await fs.writeFile(localPath, file.buffer);

        const port = env.PORT || 3000;
        const url = `http://localhost:${port}/uploads/${filename}`;
        const key = `local/uploads/${filename}`;

        return { url, key };
      } catch (error) {
        this.logger.error(
          `Failed to save image locally: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw new BadRequestException('Failed to save image to local storage.');
      }
    }
  }
}
