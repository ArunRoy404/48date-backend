import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { UserNotificationsService } from './user-notifications.service.js';
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto.js';

/**
 * In-app notification inbox — the read side of the rows the worker and date
 * flows have been writing all along.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class UserNotificationsController {
  constructor(
    private readonly userNotificationsService: UserNotificationsService,
  ) {}

  /**
   * GET /notifications
   * Paginated inbox, newest first, with unreadCount for the app badge.
   */
  @Get()
  async list(@Req() req: Request, @Query() query: GetNotificationsQueryDto) {
    const userId = req.user!.userId;
    const data = await this.userNotificationsService.list(userId, query);
    return successResponse(data, 'Notifications retrieved successfully');
  }

  /**
   * POST /notifications/:id/read
   * Marks one notification read.
   */
  @Post(':id/read')
  async markRead(@Req() req: Request, @Param('id') notificationId: string) {
    const userId = req.user!.userId;
    await this.userNotificationsService.markRead(userId, notificationId);
    return successResponse(
      { id: notificationId, isRead: true },
      'Notification marked as read',
    );
  }

  /**
   * POST /notifications/read-all
   * Marks every unread notification read. Returns how many rows changed.
   */
  @Post('read-all')
  async markAllRead(@Req() req: Request) {
    const userId = req.user!.userId;
    const updated = await this.userNotificationsService.markAllRead(userId);
    return successResponse(
      { updated },
      updated > 0
        ? `${updated} notification${updated === 1 ? '' : 's'} marked as read`
        : 'No unread notifications',
    );
  }

  /**
   * DELETE /notifications/:id
   * Removes one notification from the inbox.
   */
  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') notificationId: string) {
    const userId = req.user!.userId;
    await this.userNotificationsService.remove(userId, notificationId);
    return successResponse(
      { id: notificationId },
      'Notification deleted successfully',
    );
  }
}
