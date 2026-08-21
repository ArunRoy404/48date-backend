import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { MatchesModule } from './modules/matches/matches.module.js';
import { DatesModule } from './modules/dates/dates.module.js';
import { GamesModule } from './modules/games/games.module.js';
import { ChatModule } from './modules/chat/chat.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    MatchesModule,
    DatesModule,
    GamesModule,
    ChatModule,
  ],
})
export class AppModule {}
