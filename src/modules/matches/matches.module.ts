import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ModuleRef } from '@nestjs/core';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { MatchesController } from './matches.controller.js';
import { MatchesService } from './matches.service.js';
import { MatchExpiryProcessor } from './match-expiry.processor.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'match-expiry',
    }),
  ],
  controllers: [MatchesController],
  providers: [MatchesService, MatchExpiryProcessor],
  exports: [MatchesService],
})
export class MatchesModule implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * Idempotently schedules the repeatable expiry sweep (every 5 minutes).
   * Repeatable jobs are keyed by their name — re-adding on every boot
   * upserts the schedule rather than stacking a second one.
   */
  async onModuleInit(): Promise<void> {
    const queue = this.moduleRef.get<Queue>(getQueueToken('match-expiry'), {
      strict: false,
    });
    await queue.add(
      'sweep',
      {},
      {
        repeat: { every: 5 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: 10,
      },
    );
  }
}
