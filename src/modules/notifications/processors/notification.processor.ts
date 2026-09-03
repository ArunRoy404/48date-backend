/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { NotificationsService } from '../notifications.service.js';

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);

    try {
      switch (job.name) {
        case 'super_like':
          await this.handleSuperLike(job.data);
          break;
        case 'match':
          await this.handleMatch(job.data);
          break;
        case 'message':
          await this.handleMessage(job.data);
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (err: any) {
      this.logger.error(
        `Error processing job ${job.id} (${job.name}): ${err?.message}`,
      );
      throw err;
    }
  }

  private async handleSuperLike(data: {
    actorId: string;
    targetUserId: string;
  }) {
    const { actorId, targetUserId } = data;

    const [actor, targetUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        include: { devices: true },
      }),
    ]);

    if (!actor || !targetUser) {
      this.logger.warn(
        `Actor (${actorId}) or Target (${targetUserId}) not found for super_like job.`,
      );
      return;
    }

    const actorName = actor.name || 'Someone';
    const title = 'New Super Like! ⭐';
    const body = `${actorName} super liked your profile!`;

    // 1. Save in-app notification
    await this.prisma.notification.create({
      data: {
        userId: targetUserId,
        type: 'MATCH',
        title,
        body,
        data: { actorId },
      },
    });

    // 2. Send Push Notifications to all target devices
    if (targetUser.devices && targetUser.devices.length > 0) {
      const pushPromises = targetUser.devices.map((device) =>
        this.notificationsService.sendPushNotification(
          device.fcmToken,
          title,
          body,
          {
            type: 'SUPER_LIKE',
            actorId,
          },
        ),
      );
      await Promise.all(pushPromises);
    }

    // 3. Send SMS or Email fallback if configured (e.g. if notificationsEnabled is true)
    if (targetUser.notificationsEnabled) {
      if (targetUser.email && targetUser.isEmailVerified) {
        await this.notificationsService.sendEmail(
          targetUser.email,
          title,
          `<p>Hi ${targetUser.name || 'there'},</p><p><strong>${actorName}</strong> just super liked your profile on 48Date!</p><p>Open the app to swipe back and start the chat.</p>`,
        );
      }
      if (targetUser.phone && targetUser.isPhoneVerified) {
        await this.notificationsService.sendSms(
          targetUser.phone,
          `48Date: ${actorName} super liked your profile! Open the app to check them out.`,
        );
      }
    }
  }

  private async handleMatch(data: { userAId: string; userBId: string }) {
    const { userAId, userBId } = data;

    const [userA, userB] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userAId },
        include: { devices: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userBId },
        include: { devices: true },
      }),
    ]);

    if (!userA || !userB) {
      this.logger.warn(
        `User A (${userAId}) or User B (${userBId}) not found for match job.`,
      );
      return;
    }

    const nameA = userA.name || 'Someone';
    const nameB = userB.name || 'Someone';

    // Notify User A
    const titleA = "It's a Match! ❤️";
    const bodyA = `You matched with ${nameB}! You can now start chatting.`;
    await this.prisma.notification.create({
      data: {
        userId: userAId,
        type: 'MATCH',
        title: titleA,
        body: bodyA,
        data: { matchedUserId: userBId },
      },
    });

    if (userA.devices && userA.devices.length > 0) {
      await Promise.all(
        userA.devices.map((device) =>
          this.notificationsService.sendPushNotification(
            device.fcmToken,
            titleA,
            bodyA,
            {
              type: 'MATCH',
              matchedUserId: userBId,
            },
          ),
        ),
      );
    }

    // Notify User B
    const titleB = "It's a Match! ❤️";
    const bodyB = `You matched with ${nameA}! You can now start chatting.`;
    await this.prisma.notification.create({
      data: {
        userId: userBId,
        type: 'MATCH',
        title: titleB,
        body: bodyB,
        data: { matchedUserId: userAId },
      },
    });

    if (userB.devices && userB.devices.length > 0) {
      await Promise.all(
        userB.devices.map((device) =>
          this.notificationsService.sendPushNotification(
            device.fcmToken,
            titleB,
            bodyB,
            {
              type: 'MATCH',
              matchedUserId: userAId,
            },
          ),
        ),
      );
    }
  }

  private async handleMessage(data: {
    senderId: string;
    receiverId: string;
    messageContent: string;
  }) {
    const { senderId, receiverId, messageContent } = data;

    const [sender, receiver] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: receiverId },
        include: { devices: true },
      }),
    ]);

    if (!sender || !receiver) {
      this.logger.warn(
        `Sender (${senderId}) or Receiver (${receiverId}) not found for message job.`,
      );
      return;
    }

    const senderName = sender.name || 'Someone';
    const title = `New message from ${senderName}`;
    // Truncate message preview if it's too long
    const preview =
      messageContent.length > 60
        ? `${messageContent.substring(0, 57)}...`
        : messageContent;

    // 1. Save in-app notification
    await this.prisma.notification.create({
      data: {
        userId: receiverId,
        type: 'MESSAGE',
        title,
        body: preview,
        data: { senderId },
      },
    });

    // 2. Send Push Notifications
    if (receiver.devices && receiver.devices.length > 0) {
      await Promise.all(
        receiver.devices.map((device) =>
          this.notificationsService.sendPushNotification(
            device.fcmToken,
            title,
            preview,
            {
              type: 'MESSAGE',
              senderId,
            },
          ),
        ),
      );
    }
  }
}
