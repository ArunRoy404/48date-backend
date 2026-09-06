import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { DateStatus, TrustEventType } from '../../generated/prisma/enums.js';
import type { GetTrustHistoryQueryDto } from './dto/get-trust-history-query.dto.js';
import type {
  TrustScoreDetails,
  TrustScoreTier,
  FormattedTrustScoreEvent,
} from './types/trust-score.types.js';

@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the display tier and label from a 0-100 numerical score.
   */
  private calculateTier(score: number): {
    tier: TrustScoreTier;
    badgeLabel: string;
  } {
    if (score >= 80) {
      return { tier: 'EXCELLENT', badgeLabel: 'Top Rated Dating Partner' };
    }
    if (score >= 60) {
      return { tier: 'GOOD', badgeLabel: 'Good Standing' };
    }
    if (score >= 40) {
      return { tier: 'AVERAGE', badgeLabel: 'Standard' };
    }
    return { tier: 'NEEDS_ATTENTION', badgeLabel: 'Needs Improvement' };
  }

  /**
   * GET /trust-score
   * Retrieves the user's current trust score, tier, verification badge, and behavioral stats.
   */
  async getTrustScore(userId: string): Promise<TrustScoreDetails> {
    let trustScoreRecord = await this.prisma.trustScore.findUnique({
      where: { userId },
    });

    if (!trustScoreRecord) {
      trustScoreRecord = await this.prisma.trustScore.create({
        data: {
          userId,
          score: 50,
        },
      });
    }

    const [user, datesCompleted, positiveFeedbacks, reportsReceived, noShows] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { isUserVerified: true },
        }),
        this.prisma.datePlan.count({
          where: {
            status: DateStatus.COMPLETED,
            OR: [{ proposerId: userId }, { receiverId: userId }],
          },
        }),
        this.prisma.dateRating.count({
          where: {
            reviewedUserId: userId,
            overallScore: { gte: 4 },
          },
        }),
        this.prisma.report.count({
          where: { reportedUserId: userId },
        }),
        this.prisma.trustScoreEvent.count({
          where: {
            userId,
            type: TrustEventType.NO_SHOW,
          },
        }),
      ]);

    const { tier, badgeLabel } = this.calculateTier(trustScoreRecord.score);

    return {
      score: trustScoreRecord.score,
      tier,
      badgeLabel,
      isVerified: user?.isUserVerified ?? false,
      stats: {
        datesCompleted,
        positiveFeedbacks,
        reportsReceived,
        noShows,
      },
      updatedAt: trustScoreRecord.updatedAt,
    };
  }

  /**
   * GET /trust-score/history
   * Retrieves paginated trust score events for the caller.
   */
  async getTrustHistory(
    userId: string,
    query: GetTrustHistoryQueryDto,
  ): Promise<FormattedTrustScoreEvent[]> {
    const events = await this.prisma.trustScoreEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });

    return events.map((event) => ({
      id: event.id,
      type: event.type,
      points: event.points,
      reason: event.reason,
      createdAt: event.createdAt,
    }));
  }

  /**
   * Internal method called by other modules (dates, reports, verification)
   * to append an event and update the user's trust score.
   */
  async addEvent(
    userId: string,
    type: TrustEventType,
    points: number,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      let currentScore = await tx.trustScore.findUnique({
        where: { userId },
      });

      if (!currentScore) {
        currentScore = await tx.trustScore.create({
          data: {
            userId,
            score: 50,
          },
        });
      }

      const updatedScoreValue = Math.max(
        0,
        Math.min(100, currentScore.score + points),
      );

      const [event, updatedScore] = await Promise.all([
        tx.trustScoreEvent.create({
          data: {
            userId,
            type,
            points,
            reason: reason ?? null,
          },
        }),
        tx.trustScore.update({
          where: { userId },
          data: { score: updatedScoreValue },
        }),
      ]);

      this.logger.log(
        `Trust score for user ${userId} updated: ${currentScore.score} -> ${updatedScore.score} (${points > 0 ? '+' : ''}${points} pts for ${type})`,
      );

      return { event, trustScore: updatedScore };
    });
  }
}
