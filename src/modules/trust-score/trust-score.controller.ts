import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { TrustScoreService } from './trust-score.service.js';
import { GetTrustHistoryQueryDto } from './dto/get-trust-history-query.dto.js';

@Controller('trust-score')
@UseGuards(JwtAuthGuard)
export class TrustScoreController {
  constructor(private readonly trustScoreService: TrustScoreService) {}

  /**
   * GET /trust-score
   * Retrieves the authenticated user's trust score, badge tier, and statistics.
   */
  @Get()
  async getTrustScore(@Req() req: Request) {
    const userId = req.user!.userId;
    const data = await this.trustScoreService.getTrustScore(userId);
    return successResponse(data, 'Trust score retrieved successfully');
  }

  /**
   * GET /trust-score/history
   * Retrieves paginated event history that affected the caller's trust score.
   */
  @Get('history')
  async getTrustHistory(
    @Req() req: Request,
    @Query() query: GetTrustHistoryQueryDto,
  ) {
    const userId = req.user!.userId;
    const data = await this.trustScoreService.getTrustHistory(userId, query);
    return successResponse(data, 'Trust score history retrieved successfully');
  }
}
