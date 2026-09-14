import { Module } from '@nestjs/common';
import { DatesController } from './dates.controller.js';
import { DatesService } from './dates.service.js';
import { TrustScoreModule } from '../trust-score/trust-score.module.js';

@Module({
  imports: [TrustScoreModule],
  controllers: [DatesController],
  providers: [DatesService],
  exports: [DatesService],
})
export class DatesModule {}
