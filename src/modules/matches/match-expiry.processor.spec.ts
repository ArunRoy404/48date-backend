import { Test } from '@nestjs/testing';
// ESM Jest does not inject the `jest` global — it must be imported.
import { jest } from '@jest/globals';
import { MatchExpiryProcessor } from './match-expiry.processor.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

describe('MatchExpiryProcessor', () => {
  let processor: MatchExpiryProcessor;
  let prisma: { match: { updateMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      match: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchExpiryProcessor,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    processor = moduleRef.get(MatchExpiryProcessor);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('flips only ACTIVE matches whose 48h window has lapsed', async () => {
    // expect.any() returns any — cast so the matcher object stays typed.
    const lte = expect.any(Date) as unknown as Date;
    await processor.process({ id: 'job-1' });

    expect(prisma.match.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          expiresAt: { lte },
        },
      }),
    );
  });

  it('closes expired matches as UNMATCHED and clears the countdown', async () => {
    const result = await processor.process({ id: 'job-1' });

    const call = prisma.match.updateMany.mock.calls[0][0] as {
      data: { status: string; unmatchedAt: unknown; expiresAt: unknown };
      where: { status: string; expiresAt: { lte: Date } };
    };
    expect(call.data.status).toBe('UNMATCHED');
    expect(call.data.unmatchedAt).toEqual(expect.any(Date));
    expect(call.data.expiresAt).toBeNull();
    expect(result).toEqual({ expired: 3 });
  });

  it('reports zero when nothing has expired', async () => {
    prisma.match.updateMany.mockResolvedValue({ count: 0 });

    const result = await processor.process({ id: 'job-2' });

    expect(result).toEqual({ expired: 0 });
  });
});
