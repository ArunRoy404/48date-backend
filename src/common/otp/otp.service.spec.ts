import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// ESM Jest does not inject the `jest` global — it must be imported.
import { jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service.js';
import { DUMMY_OTP, OTP_COOLDOWN_SECONDS, OtpService } from './otp.service.js';
import { env } from '../../config/env.config.js';

/**
 * The environment matrix this suite pins down:
 *
 * | provider | NODE_ENV     | dummy `123456` | missing provider          |
 * |----------|--------------|----------------|---------------------------|
 * | absent   | development  | accepted       | dummy code in response    |
 * | absent   | production   | rejected       | 503 — fails closed        |
 * | present  | any          | rejected       | real error, never a dummy |
 */
describe('OtpService', () => {
  let service: OtpService;
  let prisma: { user: { update: jest.Mock } };

  const dispatch = () =>
    service.dispatchForUser('user-1', 'PHONE', '+8801811000001');

  beforeEach(async () => {
    prisma = {
      user: {
        update: jest.fn((): Promise<unknown> => Promise.resolve({})),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(OtpService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('assertCooldown', () => {
    it('allows a dispatch when nothing was sent before', () => {
      expect(() => service.assertCooldown(null)).not.toThrow();
    });

    it('allows a dispatch after the cooldown window has passed', () => {
      const stale = new Date(Date.now() - (OTP_COOLDOWN_SECONDS + 5) * 1000);
      expect(() => service.assertCooldown(stale)).not.toThrow();
    });

    it('throws 429 with Retry-After seconds inside the window', () => {
      const recent = new Date(Date.now() - 5 * 1000);
      expect(() => service.assertCooldown(recent)).toThrow(HttpException);
      try {
        service.assertCooldown(recent);
      } catch (e) {
        const ex = e as HttpException;
        expect(ex.getStatus()).toBe(429);
        const body = ex.getResponse() as { retryAfterSeconds: number };
        expect(body.retryAfterSeconds).toBeGreaterThan(0);
        expect(body.retryAfterSeconds).toBeLessThanOrEqual(
          OTP_COOLDOWN_SECONDS,
        );
      }
    });
  });

  describe('dispatchForUser', () => {
    it('stamps the cooldown timestamp after sending', async () => {
      jest.spyOn(service, 'send').mockResolvedValue({
        sent: true,
        message: 'ok',
      } as const);

      await dispatch();

      // expect.any() returns any — cast so the matcher object below stays typed.
      const stampedAt = expect.any(Date) as unknown as Date;
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastOtpSentAt: stampedAt },
      });
    });

    it('stamps the CONTACT column for the contact-verification flow', async () => {
      jest.spyOn(service, 'send').mockResolvedValue({
        sent: true,
        message: 'ok',
      } as const);

      await service.dispatchForUser(
        'user-1',
        'EMAIL',
        'user@example.com',
        'CONTACT',
      );

      const stampedAt = expect.any(Date) as unknown as Date;
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastContactOtpSentAt: stampedAt },
      });
    });
  });

  describe('verify — dummy code', () => {
    it('accepts the dummy code in development with no provider configured', async () => {
      const production = Object.getOwnPropertyDescriptor(env, 'IS_PRODUCTION');
      Object.defineProperty(env, 'IS_PRODUCTION', {
        value: false,
        configurable: true,
      });
      try {
        await expect(
          service.verify('PHONE', '+8801811000001', DUMMY_OTP),
        ).resolves.toBe(true);
      } finally {
        if (production) {
          Object.defineProperty(env, 'IS_PRODUCTION', production);
        }
      }
    });

    it('rejects the dummy code in production even with no provider (fail closed)', async () => {
      const production = Object.getOwnPropertyDescriptor(env, 'IS_PRODUCTION');
      Object.defineProperty(env, 'IS_PRODUCTION', {
        value: true,
        configurable: true,
      });
      try {
        await expect(
          service.verify('PHONE', '+8801811000001', DUMMY_OTP),
        ).resolves.toBe(false);
      } finally {
        if (production) {
          Object.defineProperty(env, 'IS_PRODUCTION', production);
        }
      }
    });
  });

  describe('send — production without a provider fails closed', () => {
    it('throws 503 instead of returning a dummy code', async () => {
      const production = Object.getOwnPropertyDescriptor(env, 'IS_PRODUCTION');
      Object.defineProperty(env, 'IS_PRODUCTION', {
        value: true,
        configurable: true,
      });
      try {
        await expect(dispatch()).rejects.toThrow(HttpException);
        await service
          .send('PHONE', '+8801811000001')
          .catch((e: HttpException) => {
            expect(e.getStatus()).toBe(503);
          });
      } finally {
        if (production) {
          Object.defineProperty(env, 'IS_PRODUCTION', production);
        }
      }
    });

    it('returns the dummy code in development with no provider configured', async () => {
      const production = Object.getOwnPropertyDescriptor(env, 'IS_PRODUCTION');
      Object.defineProperty(env, 'IS_PRODUCTION', {
        value: false,
        configurable: true,
      });
      try {
        const result = await service.send('PHONE', '+8801811000001');
        expect(result.otp).toBe(DUMMY_OTP);
        expect(result.message).toContain('Development mode');
      } finally {
        if (production) {
          Object.defineProperty(env, 'IS_PRODUCTION', production);
        }
      }
    });
  });
});
