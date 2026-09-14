import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { SetupProfileDto } from './dto/setup-profile.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('profile-setup')
  async setupProfile(@Body() dto: SetupProfileDto, @Req() req: Request) {
    const data = await this.usersService.setupProfile(req.user!.userId, dto);
    return successResponse(data, 'Profile updated successfully');
  }

  @Get('profile')
  async getProfile(@Req() req: Request) {
    const data = await this.usersService.getProfile(req.user!.userId);
    return successResponse(data, 'Profile fetched successfully');
  }
}
