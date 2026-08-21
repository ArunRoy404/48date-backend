import { Module } from '@nestjs/common';
import { DatesService } from './dates.service.js';
import { DatesController } from './dates.controller.js';

@Module({
  controllers: [DatesController],
  providers: [DatesService],
  exports: [DatesService],
})
export class DatesModule {}
