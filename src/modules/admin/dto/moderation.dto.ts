import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Type,
} from './moderation.dto.helpers.js';
import { ReportStatus, StoryStatus } from '../../../generated/prisma/client.js';

/** Body for POST /admin/reports/:id/review — a status transition plus note. */
export class ReviewReportDto {
  @IsEnum(
    [ReportStatus.REVIEWING, ReportStatus.RESOLVED, ReportStatus.DISMISSED],
    {
      message:
        'status must be one of: REVIEWING, RESOLVED, DISMISSED. Reports enter the system as PENDING.',
    },
  )
  status!: ReportStatus;

  /** Moderator note stored as the report's resolution. */
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'resolution must be at most 2000 characters.' })
  resolution?: string;
}

/** Body for POST /admin/stories/:id/review. */
export class ReviewStoryDto {
  @IsEnum([StoryStatus.PUBLISHED, StoryStatus.REJECTED], {
    message: 'status must be one of: PUBLISHED, REJECTED.',
  })
  status!: StoryStatus;
}

/** Body for PUT /admin/users/:id/verification-badge. */
export class SetVerificationBadgeDto {
  @IsEnum([true, false], { message: 'isVerified must be true or false.' })
  isVerified!: boolean;
}

/** Shared pagination query for admin list endpoints. */
export class AdminListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

/** List query for reports — paginates and filters by status. */
export class AdminReportsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus, {
    message: 'status must be one of: PENDING, REVIEWING, RESOLVED, DISMISSED.',
  })
  status?: ReportStatus;
}

/** List query for stories — paginates and filters by status. */
export class AdminStoriesQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsEnum(StoryStatus, {
    message: 'status must be one of: PENDING, PUBLISHED, REJECTED.',
  })
  status?: StoryStatus;
}
