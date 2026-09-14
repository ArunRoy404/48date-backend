import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { ReportsService } from './reports.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { GetReportsQueryDto } from './dto/get-reports-query.dto.js';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * POST /reports
   * Files a moderation/safety report against another user.
   */
  @Post()
  async createReport(@Req() req: Request, @Body() dto: CreateReportDto) {
    const reporterId = req.user!.userId;
    const data = await this.reportsService.createReport(reporterId, dto);
    return successResponse(data, 'Report submitted successfully');
  }

  /**
   * GET /reports/my-reports
   * Retrieves reports filed by the logged-in user.
   */
  @Get('my-reports')
  async getMyReports(@Req() req: Request, @Query() query: GetReportsQueryDto) {
    const reporterId = req.user!.userId;
    const data = await this.reportsService.getMyReports(reporterId, query);
    return successResponse(data, 'Reports retrieved successfully');
  }
}
