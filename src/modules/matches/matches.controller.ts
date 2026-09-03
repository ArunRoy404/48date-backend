import { Controller, Delete, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { MatchesService } from './matches.service.js';

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  async getActiveMatches(@Req() req: Request) {
    const data = await this.matchesService.getActiveMatches(req.user!.userId);
    return successResponse(data, 'Matches retrieved successfully');
  }

  @Delete(':id')
  async unmatch(@Param('id') matchId: string, @Req() req: Request) {
    const data = await this.matchesService.unmatch(req.user!.userId, matchId);
    return successResponse(data, 'Unmatched successfully');
  }
}
