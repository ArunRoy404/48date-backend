import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { DatesService } from './dates.service.js';
import { ProposeDateDto, RespondDateDto } from './dto/date-requests.dto.js';

@Controller('dates')
@UseGuards(JwtAuthGuard)
export class DatesController {
  constructor(private readonly datesService: DatesService) {}

  @Post('propose')
  async proposeDate(@Req() req: Request, @Body() dto: ProposeDateDto) {
    const userId = req.user!.userId;
    const { matchId, ...rest } = dto;
    const data = await this.datesService.createDatePlan(matchId, userId, rest);
    return successResponse(data, 'Date plan proposed successfully');
  }

  @Post('respond')
  async respondDate(@Req() req: Request, @Body() dto: RespondDateDto) {
    const userId = req.user!.userId;
    const data = await this.datesService.respondToDatePlan(
      dto.datePlanId,
      userId,
      dto.accept,
    );
    return successResponse(
      data,
      dto.accept ? 'Date plan accepted' : 'Date plan declined',
    );
  }

  @Get(':id')
  async getDateDetails(@Param('id') id: string) {
    const data = await this.datesService.getDatePlan(id);
    return successResponse(data, 'Date plan details retrieved successfully');
  }
}
