import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { BlocksModule } from '../blocks/blocks.module.js';
import { TrustScoreModule } from '../trust-score/trust-score.module.js';

@Module({
  imports: [BlocksModule, TrustScoreModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
