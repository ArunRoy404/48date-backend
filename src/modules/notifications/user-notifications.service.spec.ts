import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// ESM Jest does not inject the `jest` global — it must be imported.
import { jest } from '@jest/globals';
import { UserNotificationsService } from './user-notifications.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

describe('UserNotificationsService', () => {
  const ALICE = 'alice-id';
  const BOB = 'bob-id';

  let service: UserNotificationsService;
  let prisma: {
    notification: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UserNotificationsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(UserNotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('list', () => {
    it('returns notifications with an independent unread count', async () => {
      prisma.notification.findMany.mockResolvedValue([
        { id: 'n1', readAt: null, title: 'Match!', type: 'MATCH' },
      ]);
      prisma.notification.count
        .mockResolvedValueOnce(3) // unread
        .mockResolvedValueOnce(10); // total (with filters)

      const result = await service.list(ALICE, { limit: 20, offset: 0 });

      expect(result.notifications).toHaveLength(1);
      expect(result.unreadCount).toBe(3);
      expect(result.total).toBe(10);
    });

    it('scopes every query to the caller', async () => {
      await service.list(ALICE, {});

      const firstCall = prisma.notification.findMany.mock.calls[0][0] as {
        where: { userId: string };
      };
      expect(firstCall.where.userId).toBe(ALICE);
    });

    it('applies the unread filter to the page but not the badge count', async () => {
      await service.list(ALICE, { unread: true });

      const findCall = prisma.notification.findMany.mock.calls[0][0] as {
        where: { readAt: unknown };
      };
      expect(findCall.where.readAt).toBeNull();
    });
  });

  describe('markRead', () => {
    it('marks a owned unread notification read', async () => {
      prisma.notification.findUnique.mockResolvedValue({ userId: ALICE });

      await service.markRead(ALICE, 'n1');

      // expect.any() returns any — cast so the matcher object below stays typed.
      const readAt = expect.any(Date) as unknown as Date;
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', readAt: null },
        data: { readAt },
      });
    });

    it('404s on a foreign notification (no enumeration)', async () => {
      prisma.notification.findUnique.mockResolvedValue({ userId: BOB });

      await expect(service.markRead(ALICE, 'n1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });

    it('404s on an unknown id with the same error', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead(ALICE, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllRead', () => {
    it('returns the number of rows actually flipped', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const updated = await service.markAllRead(ALICE);

      // expect.any() returns any — cast so the matcher object below stays typed.
      const readAt = expect.any(Date) as unknown as Date;
      expect(updated).toBe(5);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: ALICE, readAt: null },
        data: { readAt },
      });
    });
  });

  describe('remove', () => {
    it('deletes an owned notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({ userId: ALICE });

      await service.remove(ALICE, 'n1');

      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'n1' },
      });
    });

    it('404s on a foreign notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({ userId: BOB });

      await expect(service.remove(ALICE, 'n1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.notification.delete).not.toHaveBeenCalled();
    });
  });
});
