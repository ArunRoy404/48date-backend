import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service.js';

@Module({
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
