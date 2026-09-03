import { Module } from '@nestjs/common';
<<<<<<< HEAD
import { MatchesService } from './matches.service.js';

@Module({
=======
import { MatchesController } from './matches.controller.js';
import { MatchesService } from './matches.service.js';

@Module({
  controllers: [MatchesController],
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
