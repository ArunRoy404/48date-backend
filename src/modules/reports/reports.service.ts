import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import { ReportStatus, TrustEventType } from '../../generated/prisma/enums.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { TrustScoreService } from '../trust-score/trust-score.service.js';
import type { CreateReportDto } from './dto/create-report.dto.js';
import type { GetReportsQueryDto } from './dto/get-reports-query.dto.js';
import type { FormattedReport } from './types/reports.types.js';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blocksService: BlocksService,
    private readonly trustScoreService: TrustScoreService,
  ) {}

  /**
   * POST /reports
   * Creates a safety/moderation report against another user.
   * Optionally also blocks the user.
   */
  async createReport(
    reporterId: string,
    dto: CreateReportDto,
  ): Promise<FormattedReport> {
    if (reporterId === dto.reportedUserId) {
      throw new BadRequestException('You cannot report yourself');
    }

    const reportedUser = await this.prisma.user.findUnique({
      where: { id: dto.reportedUserId },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!reportedUser) {
      throw new NotFoundException('Reported user not found');
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        reportedUserId: dto.reportedUserId,
        reason: dto.reason,
        description: dto.description ?? null,
        status: ReportStatus.PENDING,
      },
      include: {
        reportedUser: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    // If blockUser flag was checked in the client, block them immediately
    if (dto.blockUser) {
      await this.blocksService.blockUser(reporterId, dto.reportedUserId);
    }

    // Apply trust penalty for receiving a safety report
    await this.trustScoreService.addEvent(
      dto.reportedUserId,
      TrustEventType.ABUSIVE_BEHAVIOR,
      -10,
      `Report filed: ${dto.reason}`,
    );

    this.logger.log(
      `User ${reporterId} filed report against ${dto.reportedUserId} for: ${dto.reason}`,
    );

    return {
      id: report.id,
      reporterId: report.reporterId,
      reportedUserId: report.reportedUserId,
      reportedUser: formatUser(report.reportedUser),
      reason: report.reason,
      description: report.description,
      status: report.status,
      resolution: report.resolution,
      createdAt: report.createdAt,
    };
  }

  /**
   * GET /reports/my-reports
   * Retrieves reports filed by the authenticated caller.
   */
  async getMyReports(
    reporterId: string,
    query: GetReportsQueryDto,
  ): Promise<FormattedReport[]> {
    const reports = await this.prisma.report.findMany({
      where: { reporterId },
      include: {
        reportedUser: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });

    return reports.map((r) => ({
      id: r.id,
      reporterId: r.reporterId,
      reportedUserId: r.reportedUserId,
      reportedUser: formatUser(r.reportedUser),
      reason: r.reason,
      description: r.description,
      status: r.status,
      resolution: r.resolution,
      createdAt: r.createdAt,
    }));
  }
}
