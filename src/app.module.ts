import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ImagesModule } from './modules/images/images.module.js';
import { DiscoveryModule } from './modules/discovery/discovery.module.js';
import { MatchesModule } from './modules/matches/matches.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { GamesModule } from './modules/games/games.module.js';
import { env } from './config/env.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    BullModule.forRoot({
      connection: {
        url: env.REDIS_URL,
      },
    }),
    AuthModule,
    UsersModule,
    ImagesModule,
    DiscoveryModule,
    MatchesModule,
    NotificationsModule,
    ChatModule,
    GamesModule,
  ],
})
export class AppModule {}
