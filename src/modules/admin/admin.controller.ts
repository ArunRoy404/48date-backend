import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { AdminService } from './admin.service.js';
import {
  AdminReportsQueryDto,
  AdminStoriesQueryDto,
  ReviewReportDto,
  ReviewStoryDto,
  SetVerificationBadgeDto,
} from './dto/moderation.dto.js';
import { Role } from '../../generated/prisma/client.js';

/**
 * Admin moderation surface. Every route requires a valid JWT whose `role`
 * claim is ADMIN — JwtAuthGuard authenticates, RolesGuard authorizes (the
 * pair existed in common/ but was applied to zero controllers until now).
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // --- Reports -------------------------------------------------------

  /**
   * GET /admin/reports?status=PENDING
   * Moderation queue. Defaults to every status; filter for the inbox view.
   */
  @Get('reports')
  async listReports(@Query() query: AdminReportsQueryDto) {
    const data = await this.adminService.listReports(query);
    return successResponse(data, 'Reports retrieved successfully');
  }

  /**
   * POST /admin/reports/:id/review
   * Transitions a report (REVIEWING / RESOLVED / DISMISSED) with an optional
   * resolution note. Dismissing refunds the reporter's trust penalty.
   */
  @Post('reports/:id/review')
  async reviewReport(
    @Req() req: Request,
    @Param('id') reportId: string,
    @Body() dto: ReviewReportDto,
  ) {
    const adminUserId = req.user!.userId;
    const data = await this.adminService.reviewReport(
      adminUserId,
      reportId,
      dto,
    );
    return successResponse(data, 'Report reviewed successfully');
  }

  // --- Success stories ----------------------------------------------

  /**
   * GET /admin/stories?status=PENDING
   * Approval queue — defaults oldest-first so submissions are reviewed FIFO.
   */
  @Get('stories')
  async listStories(@Query() query: AdminStoriesQueryDto) {
    const data = await this.adminService.listStories(query);
    return successResponse(data, 'Stories retrieved successfully');
  }

  /**
   * POST /admin/stories/:id/review
   * Publishes or rejects a pending story.
   */
  @Post('stories/:id/review')
  async reviewStory(@Param('id') storyId: string, @Body() dto: ReviewStoryDto) {
    const data = await this.adminService.reviewStory(storyId, dto);
    return successResponse(
      data,
      dto.status === 'PUBLISHED'
        ? 'Story published successfully'
        : 'Story rejected successfully',
    );
  }

  // --- Users ---------------------------------------------------------

  /**
   * GET /admin/users/:id/moderation-view
   * Profile plus report/date counters — the context an admin needs before
   * acting on a report or badge request.
   */
  @Get('users/:id/moderation-view')
  async getUserModerationView(@Param('id') userId: string) {
    const data = await this.adminService.getUserModerationView(userId);
    return successResponse(data, 'User moderation view retrieved successfully');
  }

  /**
   * PUT /admin/users/:id/verification-badge
   * Grants or revokes the isUserVerified trust badge.
   */
  @Put('users/:id/verification-badge')
  async setVerificationBadge(
    @Param('id') userId: string,
    @Body() dto: SetVerificationBadgeDto,
  ) {
    const data = await this.adminService.setVerificationBadge(userId, dto);
    return successResponse(
      data,
      data.changed
        ? `Verification badge ${dto.isVerified ? 'granted' : 'revoked'} successfully`
        : 'Verification badge already in the requested state',
    );
  }
}
