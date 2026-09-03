import { Module } from '@nestjs/common';
<<<<<<< HEAD
import { DatesService } from './dates.service.js';
import { DatesController } from './dates.controller.js';
=======
import { DatesController } from './dates.controller.js';
import { DatesService } from './dates.service.js';
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662

@Module({
  controllers: [DatesController],
  providers: [DatesService],
  exports: [DatesService],
})
export class DatesModule {}
