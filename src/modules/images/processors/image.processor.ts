import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ImagesService } from '../images.service.js';
import { processImage } from '../image-pipeline.util.js';

interface OptimizeJobData {
  imageId: string;
  userId: string;
}

/**
 * Optimizes an uploaded original in the background: resize → WebP → EXIF
 * strip, then swaps the stored bytes for the rendition and records
 * hash/dimensions/size on the Image row.
 *
 * The original upload already succeeded and is being served — a failed job
 * only means the image stays unoptimized, so failures are retried by BullMQ
 * and otherwise never surfaced to the client.
 */
@Processor('images')
export class ImageProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageProcessor.name);

  constructor(private readonly imagesService: ImagesService) {
    super();
  }

  async process(job: Job<OptimizeJobData>): Promise<void> {
    const { imageId } = job.data;
    this.logger.log(`Optimizing image ${imageId} (job ${job.id})`);

    const original = await this.imagesService.getOriginalBuffer(imageId);
    // Empty buffer = already processed (a retried job lost the race) — done.
    if (original.length === 0) {
      this.logger.log(`Image ${imageId} already optimized, skipping`);
      return;
    }

    const processed = await processImage(original);
    await this.imagesService.persistOptimized(imageId, processed);

    const saved =
      original.length > 0
        ? Math.round((1 - processed.bytes / original.length) * 100)
        : 0;
    this.logger.log(
      `Image ${imageId} optimized: ${original.length} → ${processed.bytes} bytes (${saved}% saved)`,
    );
  }
}
