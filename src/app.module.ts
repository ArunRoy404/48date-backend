import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { RateLimitGuard } from './common/guards/rate-limit.guard.js';
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
import { DatesModule } from './modules/dates/dates.module.js';
import { TrustScoreModule } from './modules/trust-score/trust-score.module.js';
import { BlocksModule } from './modules/blocks/blocks.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';
import { SuccessStoriesModule } from './modules/success-stories/success-stories.module.js';
import { FaceVerificationModule } from './modules/face-verification/face-verification.module.js';
import { env } from './config/env.config.js';

import { OtpModule } from './common/otp/otp.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    OtpModule,
    BullModule.forRoot({
      connection: {
        url: env.REDIS_URL,
      },
    }),
    // Global rate limiting, off by default (RATE_LIMIT_ENABLED=false).
    // When enabled: a general per-IP cap on every route plus a stricter cap
    // on auth routes (see RateLimitGuard + @Throttle on auth controller).
    // The RateLimitGuard is the on/off switch; this registration only feeds
    // it the limits, so a plain env read here is enough.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: env.RATE_LIMIT_PER_MINUTE,
      },
    ]),
    AuthModule,
    UsersModule,
    ImagesModule,
    FaceVerificationModule,
    DiscoveryModule,
    MatchesModule,
    NotificationsModule,
    ChatModule,
    GamesModule,
    DatesModule,
    TrustScoreModule,
    BlocksModule,
    ReportsModule,
    SubscriptionsModule,
    SuccessStoriesModule,
  ],
  providers: [
    // Global guard — no-ops unless RATE_LIMIT_ENABLED=true (see the guard).
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
