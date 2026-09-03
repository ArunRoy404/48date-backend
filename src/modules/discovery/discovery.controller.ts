import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { DiscoveryService } from './discovery.service.js';
import { SwipeDto } from './dto/swipe.dto.js';
import { UpdatePreferencesDto } from './dto/update-preferences.dto.js';

@Controller('discovery')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get()
  async getDiscoveryProfiles(@Req() req: Request) {
    const data = await this.discoveryService.getDiscoveryProfiles(
      req.user!.userId,
    );
    return successResponse(data, 'Discovery profiles fetched successfully');
  }

  @Get('preferences')
  async getPreferences(@Req() req: Request) {
    const data = await this.discoveryService.getDiscoveryPreferences(
      req.user!.userId,
    );
    return successResponse(data, 'Discovery preferences fetched successfully');
  }

  @Patch('preferences')
  async updatePreferences(
    @Body() dto: UpdatePreferencesDto,
    @Req() req: Request,
  ) {
    const data = await this.discoveryService.updateDiscoveryPreferences(
      req.user!.userId,
      dto,
    );
    return successResponse(data, 'Discovery preferences updated successfully');
  }

  @Get(':id')
  async getProfileDetail(@Param('id') targetId: string, @Req() req: Request) {
    const data = await this.discoveryService.getProfileDetail(
      req.user!.userId,
      targetId,
    );
    return successResponse(data, 'Profile details fetched successfully');
  }

  @Post('swipe')
  async swipe(@Body() dto: SwipeDto, @Req() req: Request) {
    const data = await this.discoveryService.swipe(req.user!.userId, dto);
    const message = data.isMatch
      ? "It's a match!"
      : 'Swipe recorded successfully';
    return successResponse(data, message);
  }
}
