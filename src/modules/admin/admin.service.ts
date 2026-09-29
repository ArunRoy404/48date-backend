import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import {
  ReportStatus,
  StoryStatus,
  TrustEventType,
} from '../../generated/prisma/client.js';
import { TrustScoreService } from '../trust-score/trust-score.service.js';
import type {
  AdminReportsQueryDto,
  AdminStoriesQueryDto,
  ReviewReportDto,
  ReviewStoryDto,
  SetVerificationBadgeDto,
} from './dto/moderation.dto.js';

/**
 * Admin moderation core — the three features that were dead-ended until this
 * module existed:
 *
 *  1. Report moderation   (reports could never leave PENDING)
 *  2. Success-story approval (stories could never be published)
 *  3. Verification badge granting (isUserVerified had no setter anywhere)
 *
 * Built against the ACTUAL schema enums (PENDING/REVIEWING/RESOLVED/DISMISSED,
 * PENDING/PUBLISHED/REJECTED, Role=ADMIN) rather than the admin spec's
 * invented ones — see docs/BACKEND-STATUS.md §5.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trustScoreService: TrustScoreService,
  ) {}

  // ------------------------------------------------------------------
  // Reports
  // ------------------------------------------------------------------

  /** Lists reports for the moderation queue, newest first. */
  async listReports(query: AdminReportsQueryDto) {
    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where: query.status ? { status: query.status } : undefined,
        include: {
          reporter: { include: { images: { orderBy: { sortOrder: 'asc' } } } },
          reportedUser: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
      }),
      this.prisma.report.count({
        where: query.status ? { status: query.status } : undefined,
      }),
    ]);

    return {
      total,
      reports: reports.map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        description: r.description,
        resolution: r.resolution,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
        reporter: formatUser(r.reporter),
        reportedUser: formatUser(r.reportedUser),
      })),
    };
  }

  /**
   * Transitions a report through its lifecycle.
   *
   * Allowed moves: PENDING→REVIEWING/RESOLVED/DISMISSED, REVIEWING→RESOLVED/
   * DISMISSED. A terminal report (RESOLVED/DISMISSED) cannot be reopened —
   * moderation decisions must not be silently rewritten in the audit trail.
   */
  async reviewReport(
    adminUserId: string,
    reportId: string,
    dto: ReviewReportDto,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const terminal =
      report.status === ReportStatus.RESOLVED ||
      report.status === ReportStatus.DISMISSED;
    if (terminal) {
      throw new BadRequestException(
        `This report was already ${report.status.toLowerCase()} and cannot be reviewed again.`,
      );
    }

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        resolution: dto.resolution ?? null,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      },
    });

    // A dismissed report was a false accusation — give back the trust points
    // the automatic penalty took when the report was filed (-10). A resolved
    // one was upheld, so the penalty stands.
    if (dto.status === ReportStatus.DISMISSED) {
      await this.trustScoreService.addEvent(
        report.reportedUserId,
        TrustEventType.POSITIVE_FEEDBACK,
        10,
        'A report against you was reviewed and dismissed',
      );
    }

    this.logger.log(
      `Report ${reportId} transitioned ${report.status} -> ${dto.status} by admin ${adminUserId}`,
    );

    return {
      id: updated.id,
      status: updated.status,
      resolution: updated.resolution,
      reviewedBy: updated.reviewedBy,
      reviewedAt: updated.reviewedAt,
    };
  }

  // ------------------------------------------------------------------
  // Success stories
  // ------------------------------------------------------------------

  /** Lists stories for the approval queue, oldest first (fair FIFO review). */
  async listStories(query: AdminStoriesQueryDto) {
    const where = query.status ? { status: query.status } : undefined;
    const [stories, total] = await Promise.all([
      this.prisma.successStory.findMany({
        where,
        include: {
          author: { include: { images: { orderBy: { sortOrder: 'asc' } } } },
          partner: { include: { images: { orderBy: { sortOrder: 'asc' } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
      }),
      this.prisma.successStory.count({ where }),
    ]);

    return {
      total,
      stories: stories.map((s) => ({
        id: s.id,
        status: s.status,
        title: s.title,
        story: s.story,
        images: s.images,
        matchId: s.matchId,
        createdAt: s.createdAt,
        author: formatUser(s.author),
        partner: formatUser(s.partner),
      })),
    };
  }

  /**
   * Approves (PUBLISHED) or rejects a story. Only PENDING stories are
   * reviewable — a published story stays published until a delete feature
   * exists, and a rejected story stays rejected.
   */
  async reviewStory(storyId: string, dto: ReviewStoryDto) {
    const story = await this.prisma.successStory.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      throw new NotFoundException('Success story not found');
    }

    if (story.status !== StoryStatus.PENDING) {
      throw new BadRequestException(
        `This story is already ${story.status.toLowerCase()} and cannot be reviewed again.`,
      );
    }

    const updated = await this.prisma.successStory.update({
      where: { id: storyId },
      data: { status: dto.status },
    });

    this.logger.log(`Story ${storyId} -> ${dto.status}`);

    return {
      id: updated.id,
      status: updated.status,
      title: updated.title,
    };
  }

  // ------------------------------------------------------------------
  // Verification badge
  // ------------------------------------------------------------------

  /**
   * Grants or revokes the `isUserVerified` trust badge — previously no
   * setter existed anywhere in the codebase, not even for admins.
   */
  async setVerificationBadge(userId: string, dto: SetVerificationBadgeDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isUserVerified: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // No-op writes still return success — idempotent for retrying clients.
    if (user.isUserVerified === dto.isVerified) {
      return { userId, isUserVerified: dto.isVerified, changed: false };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isUserVerified: dto.isVerified },
    });

    this.logger.log(
      `Verification badge ${dto.isVerified ? 'granted to' : 'revoked from'} user ${userId}`,
    );

    return { userId, isUserVerified: dto.isVerified, changed: true };
  }

  /**
   * Quick admin profile view — enough to judge a badge grant or a report
   * without exposing another admin surface yet.
   */
  async getUserModerationView(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [reportsReceived, reportsFiled, datesCompleted] = await Promise.all([
      this.prisma.report.count({ where: { reportedUserId: userId } }),
      this.prisma.report.count({ where: { reporterId: userId } }),
      this.prisma.datePlan.count({
        where: {
          status: 'COMPLETED',
          OR: [{ proposerId: userId }, { receiverId: userId }],
        },
      }),
    ]);

    return {
      user: formatUser(user),
      moderation: { reportsReceived, reportsFiled, datesCompleted },
    };
  }
}
