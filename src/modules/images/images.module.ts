import { Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { ImagesController } from './images.controller.js';
import { ImagesService } from './images.service.js';
import { ImageProcessor } from './processors/image.processor.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'images',
    }),
  ],
  controllers: [ImagesController],
  providers: [ImagesService, ImageProcessor],
  exports: [ImagesService],
})
export class ImagesModule implements OnModuleInit {
  constructor(
    private readonly imagesService: ImagesService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * The queue is registered by this module, so the service gets its handle
   * here rather than via @InjectQueue — that keeps the service constructible
   * with plain mocks in unit tests and lets it degrade to inline processing
   * when the handle is absent.
   */
  onModuleInit(): void {
    const queue = this.moduleRef.get<Queue>(getQueueToken('images'), {
      strict: false,
    });
    this.imagesService.attachQueue({
      add: (name, data, opts) => queue.add(name, data, opts),
    });
  }
}
