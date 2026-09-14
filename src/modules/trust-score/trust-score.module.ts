import { Module } from '@nestjs/common';
import { TrustScoreController } from './trust-score.controller.js';
import { TrustScoreService } from './trust-score.service.js';

@Module({
  controllers: [TrustScoreController],
  providers: [TrustScoreService],
  exports: [TrustScoreService],
})
export class TrustScoreModule {}
