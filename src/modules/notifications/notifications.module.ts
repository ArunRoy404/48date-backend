import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { NotificationsService } from './notifications.service.js';
import { UserNotificationsService } from './user-notifications.service.js';
import { UserNotificationsController } from './user-notifications.controller.js';
import { NotificationProcessor } from './processors/notification.processor.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  controllers: [UserNotificationsController],
  providers: [
    NotificationsService,
    UserNotificationsService,
    NotificationProcessor,
  ],
  exports: [NotificationsService, UserNotificationsService],
})
export class NotificationsModule {}
