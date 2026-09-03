import { Module } from '@nestjs/common';
<<<<<<< HEAD
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { MatchesModule } from '../matches/matches.module.js';
import { DatesModule } from '../dates/dates.module.js';
import { GamesModule } from '../games/games.module.js';

@Module({
  imports: [AuthModule, MatchesModule, DatesModule, GamesModule],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
=======
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { env } from '../../config/env.config.js';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    JwtModule.register({
      secret: env.JWT_ACCESS_SECRET,
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService],
  exports: [ChatGateway, ChatService],
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
})
export class ChatModule {}
