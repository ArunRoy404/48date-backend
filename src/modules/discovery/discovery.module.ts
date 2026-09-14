import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { MatchesModule } from '../matches/matches.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';

@Module({
  imports: [PrismaModule, MatchesModule, NotificationsModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
