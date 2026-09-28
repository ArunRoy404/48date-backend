import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// ESM Jest does not inject the `jest` global — it must be imported.
import { jest } from '@jest/globals';
import { DevicesService } from './devices.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { RegisterDeviceDto } from './dto/register-device.dto.js';

/**
 * The security-critical property under test: `fcmToken` is globally unique,
 * so registering a token that already exists under another user must
 * REASSIGN it to the new caller — a phone must never keep receiving push for
 * an account its user is no longer signed into.
 */
describe('DevicesService', () => {
  const ALICE = 'alice-id';
  const BOB = 'bob-id';
  const TOKEN = 'fcm-token-abc123';

  let service: DevicesService;
  let prisma: {
    device: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const dto = (platform: 'IOS' | 'ANDROID' = 'ANDROID'): RegisterDeviceDto => ({
    fcmToken: TOKEN,
    platform,
  });

  beforeEach(async () => {
    prisma = {
      device: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DevicesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(DevicesService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('registerDevice', () => {
    it('upserts keyed on the token with the caller as owner', async () => {
      prisma.device.upsert.mockResolvedValue({ id: 'd1', userId: ALICE });

      await service.registerDevice(ALICE, dto());

      // expect.objectContaining() returns any — cast so the object stays typed.
      const update = expect.objectContaining({ userId: ALICE }) as unknown as {
        userId: string;
      };
      expect(prisma.device.upsert).toHaveBeenCalledWith({
        where: { fcmToken: TOKEN },
        create: { userId: ALICE, fcmToken: TOKEN, platform: 'ANDROID' },
        update,
      });
    });

    it('reassigns the token when it previously belonged to another user', async () => {
      prisma.device.upsert.mockResolvedValue({ id: 'd1', userId: BOB });

      await service.registerDevice(BOB, dto('IOS'));

      // The update branch must overwrite userId with the NEW caller.
      const call = prisma.device.upsert.mock.calls[0][0] as {
        update: { userId: string };
      };
      expect(call.update.userId).toBe(BOB);
    });
  });

  describe('unregisterDevice', () => {
    it('deletes the token when it belongs to the caller', async () => {
      prisma.device.findUnique.mockResolvedValue({ userId: ALICE });
      prisma.device.delete.mockResolvedValue({});

      await service.unregisterDevice(ALICE, TOKEN);

      expect(prisma.device.delete).toHaveBeenCalledWith({
        where: { fcmToken: TOKEN },
      });
    });

    it('404s when the token belongs to someone else (no enumeration)', async () => {
      prisma.device.findUnique.mockResolvedValue({ userId: BOB });

      await expect(service.unregisterDevice(ALICE, TOKEN)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.device.delete).not.toHaveBeenCalled();
    });

    it('404s when the token is not registered at all', async () => {
      prisma.device.findUnique.mockResolvedValue(null);

      await expect(service.unregisterDevice(ALICE, TOKEN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listDevices', () => {
    it('returns only the caller’s devices, newest activity first', async () => {
      prisma.device.findMany.mockResolvedValue([{ id: 'd1' }]);

      const devices = await service.listDevices(ALICE);

      expect(devices).toHaveLength(1);
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { userId: ALICE },
        orderBy: { lastActiveAt: 'desc' },
      });
    });
  });
});
