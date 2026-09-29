import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { env } from '../../config/env.config.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { detectImageFormat } from '../../common/utils/image-type.js';
import { processImage, type ProcessedImage } from './image-pipeline.util.js';
import { buildImageUrl } from './image-metadata.util.js';
import type {
  ImageUploadResponse,
  MultiImageUploadResponse,
} from './types/images.types.js';

/**
 * What an upload yields once the pipeline is done with it.
 *
 * `imageId` is the DB metadata row (rule #1: hash + metadata only). When the
 * BullMQ worker is configured it optimizes in the background and the response
 * says `processing: 'queued'` — the client shows the original immediately and
 * the WebP rendition replaces it within seconds. Without a queue (plain unit
 * tests, minimal deployments) processing happens inline before responding.
 */
export interface StoredImage extends ImageUploadResponse {
  imageId: string;
  processing: 'queued' | 'completed';
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);
  private readonly s3Client?: S3Client;
  private readonly bucketName?: string;
  private readonly publicUrl?: string;
  /** Optimizer job handle, wired by ImagesModule after the queue is registered. */
  private imagesQueue?: {
    add: (name: string, data: object, opts?: object) => Promise<unknown>;
  };

  constructor(private readonly prisma: PrismaService) {
    const accountId = env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    const bucket = env.R2_BUCKET;
    const publicUrl = env.R2_PUBLIC_URL;

    if (accountId && accessKeyId && secretAccessKey && bucket && publicUrl) {
      this.bucketName = bucket;
      this.publicUrl = publicUrl.replace(/\/+$/, '');
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

  /**
   * Called by ImagesModule after BullMQ registers the queue — the module owns
   * the queue, the service only needs the handle. Structural on purpose so
   * unit tests can pass a plain mock instead of a real Queue instance.
   */
  attachQueue(queue: {
    add: (name: string, data: object, opts?: object) => Promise<unknown>;
  }): void {
    this.imagesQueue = queue;
  }

  async uploadImages(
    files: Express.Multer.File[],
    userId: string,
  ): Promise<MultiImageUploadResponse> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No file provided for upload.');
    }

    if (files.length > 6) {
      throw new BadRequestException(
        'Cannot upload more than 6 images at once.',
      );
    }

    const uploaded = await Promise.all(
      files.map((file) => this.uploadImage(file, userId)),
    );

    return {
      url: uploaded[0].url,
      key: uploaded[0].key,
      images: uploaded,
    };
  }

  async uploadImage(
    file: Express.Multer.File,
    userId: string,
  ): Promise<StoredImage> {
    if (!file) {
      throw new BadRequestException('No file provided for upload.');
    }

    // Size check first — cheaper than content sniffing.
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds the 10MB limit.');
    }

    // Trust the content, not the client. The declared Content-Type and the
    // original filename are attacker-controlled; sniffing magic bytes is what
    // actually stops a renamed .html/.js landing in storage and being served
    // from the API origin. The declared type is still checked so an obviously
    // wrong category (a PDF renamed .png) gets a precise error message.
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

    const detected = detectImageFormat(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'This file is not a valid image. Only real JPEG, PNG, WEBP, and GIF files are allowed.',
      );
    }

    // --- Optimize (inline when no worker; the queue path sets metadata later)
    let processed: ProcessedImage | null = null;
    if (!this.imagesQueue) {
      try {
        processed = await processImage(file.buffer);
      } catch (error) {
        this.logger.error(
          `Image optimization failed: ${(error as Error).message}`,
        );
        throw new BadRequestException('This image could not be processed.');
      }
    }

    // --- Dedup (hash of the processed bytes) -----------------------------
    // Seed/legacy rows have hash=null and are naturally excluded by this
    // filter — the seed's CDN URLs can never collide with a real upload.
    const duplicate = await this.prisma.image.findFirst({
      where: { userId, hash: processed?.hash ?? undefined },
    });
    if (duplicate) {
      this.logger.log(
        `Dedup: user ${userId} re-uploaded an existing image (${duplicate.id})`,
      );
      return {
        url: buildImageUrl(duplicate.r2Key),
        key: duplicate.r2Key,
        imageId: duplicate.id,
        processing: 'completed',
      };
    }

    // --- Persist the original bytes --------------------------------------
    const key = await this.store(file.buffer, userId);

    // --- Metadata row (hash + dimensions — never the blob, rule #1) ------
    const imageRow = await this.prisma.image.create({
      data: {
        userId,
        r2Key: key,
        hash: processed?.hash ?? null,
        width: processed?.width ?? null,
        height: processed?.height ?? null,
        bytes: processed?.bytes ?? null,
      },
    });

    if (!processed) {
      await this.enqueueOptimization(imageRow.id, userId);
    }

    return {
      url: buildImageUrl(key),
      key,
      imageId: imageRow.id,
      processing: processed ? 'completed' : 'queued',
    };
  }

  /** Store the original bytes; the worker later replaces them with the WebP. */
  private async store(original: Buffer, userId: string): Promise<string> {
    const detected = detectImageFormat(original);
    const filename = `${crypto.randomUUID()}-${Date.now()}.${detected?.extension ?? 'bin'}`;

    if (this.s3Client && this.bucketName && this.publicUrl) {
      const key = `users/${userId}/images/${filename}`;
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: original,
            // Sniffed MIME, not the client-declared one — what the bytes say wins.
            ContentType: detected?.mimeType ?? 'application/octet-stream',
          }),
        );
        return key;
      } catch (error) {
        this.logger.error(
          `Failed to upload image to Cloudflare R2: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw new BadRequestException(
          'Failed to upload image to storage provider.',
        );
      }
    }

    // Local fallback
    try {
      const uploadDir = join(process.cwd(), 'uploads');
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(join(uploadDir, filename), original);
      return `local/uploads/${filename}`;
    } catch (error) {
      this.logger.error(
        `Failed to save image locally: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new BadRequestException('Failed to save image to local storage.');
    }
  }

  private async enqueueOptimization(
    imageId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.imagesQueue!.add('optimize', { imageId, userId });
    } catch (error) {
      // Queue down ≠ lose the upload: the row keeps null dimensions and the
      // URL still serves the original bytes. Nothing breaks; the image just
      // stays unoptimized until a re-upload or a manual sweep.
      this.logger.error(
        `Failed to enqueue optimization for image ${imageId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Replaces the stored original with the optimized rendition and records
   * its metadata. Idempotent — a retried job overwrites the same key.
   */
  async persistOptimized(
    imageId: string,
    processed: ProcessedImage,
  ): Promise<void> {
    const image = await this.prisma.image.findUnique({
      where: { id: imageId },
    });
    if (!image) {
      throw new BadRequestException(`Image ${imageId} not found`);
    }

    await this.storeProcessed(
      image.r2Key,
      processed.buffer,
      processed.mimeType,
    );

    await this.prisma.image.update({
      where: { id: imageId },
      data: {
        hash: processed.hash,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      },
    });
  }

  private async storeProcessed(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    if (this.s3Client && this.bucketName) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      return;
    }
    const localPath = join(
      process.cwd(),
      key.replace('local/uploads', 'uploads'),
    );
    await fs.writeFile(localPath, buffer);
  }

  /** Loads the original bytes for the optimizer worker. */
  async getOriginalBuffer(imageId: string): Promise<Buffer> {
    const image = await this.prisma.image.findUnique({
      where: { id: imageId },
    });
    if (!image) {
      throw new BadRequestException(`Image ${imageId} not found`);
    }
    if (image.hash) {
      // Already processed (retried job or a race) — the worker treats an
      // empty buffer as "nothing to do".
      return Buffer.alloc(0);
    }
    if (this.s3Client && this.bucketName) {
      const response = await this.s3Client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: image.r2Key }),
      );
      const bytes = await response.Body!.transformToByteArray();
      return Buffer.from(bytes);
    }
    const localPath = join(
      process.cwd(),
      image.r2Key.replace('local/uploads', 'uploads'),
    );
    return fs.readFile(localPath);
  }
}
