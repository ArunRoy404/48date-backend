<<<<<<< HEAD
import { Module } from '@nestjs/common';
import { GamesService } from './games.service.js';
import { GamesController } from './games.controller.js';

@Module({
=======
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { GamesController } from './games.controller.js';
import { GamesService } from './games.service.js';

@Module({
  imports: [PrismaModule, forwardRef(() => ChatModule)],
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
