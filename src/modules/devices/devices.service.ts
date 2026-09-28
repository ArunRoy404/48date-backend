import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Device } from '../../generated/prisma/client.js';
import type { RegisterDeviceDto } from './dto/register-device.dto.js';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registers (or refreshes) an FCM device token for the caller.
   *
   * `fcmToken` is globally unique, and a token can legitimately move between
   * accounts — app reinstalls, account switches on one phone. The upsert is
   * keyed on the token, not (user, token): registering a token that belongs
   * to another user **reassigns it**, so a phone never keeps receiving push
   * for an account the user is no longer signed into. Any stale row pointing
   * at the new owner's id is updated in place.
   */
  async registerDevice(
    userId: string,
    dto: RegisterDeviceDto,
  ): Promise<Device> {
    const device = await this.prisma.device.upsert({
      where: { fcmToken: dto.fcmToken },
      create: {
        userId,
        fcmToken: dto.fcmToken,
        platform: dto.platform,
      },
      update: {
        userId,
        platform: dto.platform,
        lastActiveAt: new Date(),
      },
    });

    this.logger.log(
      `Device registered for user ${userId} (${dto.platform}) — token ${dto.fcmToken.substring(0, 10)}...`,
    );
    return device;
  }

  /**
   * Removes a device registration — called on logout so the account stops
   * receiving push on hardware it is no longer signed into.
   */
  async unregisterDevice(userId: string, fcmToken: string): Promise<void> {
    const device = await this.prisma.device.findUnique({
      where: { fcmToken },
      select: { userId: true },
    });

    // Not found, or belongs to someone else — both are the same answer, so
    // the endpoint cannot be used to probe which tokens exist.
    if (!device || device.userId !== userId) {
      throw new NotFoundException('Device registration not found');
    }

    await this.prisma.device.delete({ where: { fcmToken } });
    this.logger.log(`Device unregistered for user ${userId}`);
  }

  /** Lists the caller's registered devices (debug/account-management view). */
  async listDevices(userId: string): Promise<Device[]> {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });
  }
}
