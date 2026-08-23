import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ImagesModule } from './modules/images/images.module.js';
import { DiscoveryModule } from './modules/discovery/discovery.module.js';
import { MatchesModule } from './modules/matches/matches.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ImagesModule,
    DiscoveryModule,
    MatchesModule,
  ],
})
export class AppModule {}
