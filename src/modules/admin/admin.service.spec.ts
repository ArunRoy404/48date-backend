import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// ESM Jest does not inject the `jest` global — it must be imported.
import { jest } from '@jest/globals';
import { AdminService } from './admin.service.js';
import {
  ReportStatus,
  StoryStatus,
  TrustEventType,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TrustScoreService } from '../trust-score/trust-score.service.js';

/**
 * Moderation lifecycle rules under test:
 *  - a report cannot be reviewed twice (terminal states are final)
 *  - dismissing a report refunds the automatic -10 trust penalty
 *  - only PENDING stories are reviewable
 *  - badge setting is idempotent and reports whether anything changed
 */
describe('AdminService', () => {
  const ADMIN = 'admin-id';

  let service: AdminService;
  let prisma: {
    report: {
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    successStory: {
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    user: { findUnique: jest.Mock; update: jest.Mock };
    datePlan: { count: jest.Mock };
  };
  let trustScore: { addEvent: jest.Mock };

  const reportRow = (status: ReportStatus) => ({
    id: 'r1',
    reporterId: 'reporter-id',
    reportedUserId: 'reported-id',
    status,
  });

  beforeEach(async () => {
    prisma = {
      report: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      successStory: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      datePlan: { count: jest.fn().mockResolvedValue(0) },
    };
    trustScore = { addEvent: jest.fn().mockResolvedValue({}) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        { provide: TrustScoreService, useValue: trustScore },
      ],
    }).compile();

    service = moduleRef.get(AdminService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('reviewReport', () => {
    it('transitions a PENDING report and stamps reviewer metadata', async () => {
      prisma.report.findUnique.mockResolvedValue(
        reportRow(ReportStatus.PENDING),
      );
      prisma.report.update.mockResolvedValue({
        id: 'r1',
        status: ReportStatus.REVIEWING,
      });

      const result = await service.reviewReport(ADMIN, 'r1', {
        status: ReportStatus.REVIEWING,
      });

      expect(result.status).toBe(ReportStatus.REVIEWING);
      // expect.objectContaining() returns any — cast so the object stays typed.
      const data = expect.objectContaining({
        reviewedBy: ADMIN,
      }) as unknown as {
        reviewedBy: string;
      };
      expect(prisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data,
        }),
      );
    });

    it('refuses to review a RESOLVED report again', async () => {
      prisma.report.findUnique.mockResolvedValue(
        reportRow(ReportStatus.RESOLVED),
      );

      await expect(
        service.reviewReport(ADMIN, 'r1', { status: ReportStatus.DISMISSED }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.report.update).not.toHaveBeenCalled();
    });

    it('refuses to review a DISMISSED report again', async () => {
      prisma.report.findUnique.mockResolvedValue(
        reportRow(ReportStatus.DISMISSED),
      );

      await expect(
        service.reviewReport(ADMIN, 'r1', { status: ReportStatus.RESOLVED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refunds the trust penalty when a report is dismissed', async () => {
      prisma.report.findUnique.mockResolvedValue(
        reportRow(ReportStatus.PENDING),
      );
      prisma.report.update.mockResolvedValue({ id: 'r1' });

      await service.reviewReport(ADMIN, 'r1', {
        status: ReportStatus.DISMISSED,
        resolution: 'False report',
      });

      expect(trustScore.addEvent).toHaveBeenCalledWith(
        'reported-id',
        TrustEventType.POSITIVE_FEEDBACK,
        10,
        'A report against you was reviewed and dismissed',
      );
    });

    it('does NOT refund trust when a report is upheld (RESOLVED)', async () => {
      prisma.report.findUnique.mockResolvedValue(
        reportRow(ReportStatus.PENDING),
      );
      prisma.report.update.mockResolvedValue({ id: 'r1' });

      await service.reviewReport(ADMIN, 'r1', {
        status: ReportStatus.RESOLVED,
      });

      expect(trustScore.addEvent).not.toHaveBeenCalled();
    });

    it('404s on an unknown report', async () => {
      prisma.report.findUnique.mockResolvedValue(null);

      await expect(
        service.reviewReport(ADMIN, 'nope', { status: ReportStatus.REVIEWING }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reviewStory', () => {
    it('publishes a PENDING story', async () => {
      prisma.successStory.findUnique.mockResolvedValue({
        id: 's1',
        status: StoryStatus.PENDING,
      });
      prisma.successStory.update.mockResolvedValue({
        id: 's1',
        status: StoryStatus.PUBLISHED,
        title: 'We met on 48Date',
      });

      const result = await service.reviewStory('s1', {
        status: StoryStatus.PUBLISHED,
      });

      expect(result.status).toBe(StoryStatus.PUBLISHED);
    });

    it('refuses to review a story that is already PUBLISHED', async () => {
      prisma.successStory.findUnique.mockResolvedValue({
        id: 's1',
        status: StoryStatus.PUBLISHED,
      });

      await expect(
        service.reviewStory('s1', { status: StoryStatus.REJECTED }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.successStory.update).not.toHaveBeenCalled();
    });

    it('404s on an unknown story', async () => {
      prisma.successStory.findUnique.mockResolvedValue(null);

      await expect(
        service.reviewStory('nope', { status: StoryStatus.PUBLISHED }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setVerificationBadge', () => {
    it('grants the badge and reports changed: true', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isUserVerified: false,
      });

      const result = await service.setVerificationBadge('u1', {
        isVerified: true,
      });

      expect(result).toEqual({
        userId: 'u1',
        isUserVerified: true,
        changed: true,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isUserVerified: true },
      });
    });

    it('is idempotent — same state returns changed: false without a write', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isUserVerified: true,
      });

      const result = await service.setVerificationBadge('u1', {
        isVerified: true,
      });

      expect(result.changed).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('revokes the badge', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        isUserVerified: true,
      });

      const result = await service.setVerificationBadge('u1', {
        isVerified: false,
      });

      expect(result.changed).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isUserVerified: false },
      });
    });

    it('404s on an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.setVerificationBadge('nope', { isVerified: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
