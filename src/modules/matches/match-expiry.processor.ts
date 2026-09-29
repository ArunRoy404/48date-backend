import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/**
 * Repeatable sweep — flips expired matches to UNMATCHED.
 *
 * The queue is registered in MatchesModule, which enqueues a repeatable job
 * every 5 minutes on boot. Matches whose 48h window lapsed without a first
 * message close here; the chat guard additionally refuses sends on an expired
 * match on sight, so the few-minutes sweep interval never lets a dead match
 * stay chatty.
 */
@Processor('match-expiry')
export class MatchExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(MatchExpiryProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(): Promise<{ expired: number }> {
    const result = await this.prisma.match.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: new Date() },
      },
      data: {
        status: 'UNMATCHED',
        unmatchedAt: new Date(),
        expiresAt: null,
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Expired ${result.count} match(es) past their 48h window`,
      );
    }
    return { expired: result.count };
  }
}
