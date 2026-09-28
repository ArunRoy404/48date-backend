import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Notification, Prisma } from '../../generated/prisma/client.js';
import type { GetNotificationsQueryDto } from './dto/get-notifications-query.dto.js';

export interface FormattedNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  readAt: Date | null;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationsListResponse {
  notifications: FormattedNotification[];
  unreadCount: number;
  total: number;
}

/**
 * Reads and acknowledges in-app notifications.
 *
 * Rows are written all over the app (match/message processor, date invites,
 * cancellations…); this is the single place a client reads them back. Kept
 * separate from NotificationsService, which owns providers and the BullMQ
 * queue — reading must not drag queue wiring into every test.
 */
@Injectable()
export class UserNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private format(notification: Notification): FormattedNotification {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      readAt: notification.readAt,
      isRead: notification.readAt !== null,
      createdAt: notification.createdAt,
    };
  }

  /**
   * Paginated list for the logged-in user, newest first, with the unread
   * count the app renders as a badge.
   */
  async list(
    userId: string,
    query: GetNotificationsQueryDto,
  ): Promise<NotificationsListResponse> {
    const where: Prisma.NotificationWhereInput = { userId };

    if (query.unread) {
      where.readAt = null;
    }
    if (query.type) {
      where.type = query.type;
    }

    const [notifications, unreadCount, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
      }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications: notifications.map((n) => this.format(n)),
      unreadCount,
      total,
    };
  }

  /** Marks one notification read; only the owner may acknowledge it. */
  async markRead(userId: string, notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification || notification.userId !== userId) {
      // Same 404 for missing and foreign — no enumeration.
      throw new NotFoundException('Notification not found');
    }

    // Already-read rows stay read; the update is a no-op rather than an error.
    await this.prisma.notification.updateMany({
      where: { id: notificationId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** Marks every unread notification for the caller read (the "read all" button). */
  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /** Soft-deletes one notification; only the owner may remove it. */
  async remove(userId: string, notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({ where: { id: notificationId } });
  }

  /** Validates the mark-many body up front so the route stays thin. */
  assertIdsProvided(ids?: string[]): void {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('Provide at least one notification id.');
    }
  }
}
