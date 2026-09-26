import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { SetupProfileDto } from './dto/setup-profile.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import {
  AddContactDto,
  RequestContactOtpDto,
  VerifyContactOtpDto,
} from './dto/contact.dto.js';
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

  /**
   * Location-only update. Called on app open and whenever the device reports
   * a new fix or a change of permission — deliberately separate from
   * profile-setup so a coordinate refresh cannot touch profile fields.
   */
  @Patch('location')
  async updateLocation(@Body() dto: UpdateLocationDto, @Req() req: Request) {
    const data = await this.usersService.updateLocation(req.user!.userId, dto);
    return successResponse(data, 'Location updated successfully');
  }

  /**
   * Adds or replaces the phone/email on the account. Lands unverified — the
   * two endpoints below prove it.
   */
  @Patch('contact')
  async addContact(@Body() dto: AddContactDto, @Req() req: Request) {
    const data = await this.usersService.addContact(req.user!.userId, dto);
    return successResponse(data, 'Contact saved — verification required');
  }

  @Post('contact/request-otp')
  async requestContactOtp(
    @Body() dto: RequestContactOtpDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.requestContactOtp(
      req.user!.userId,
      dto,
    );
    return successResponse(data, 'Verification code sent');
  }

  @Post('contact/verify-otp')
  async verifyContactOtp(
    @Body() dto: VerifyContactOtpDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.verifyContactOtp(
      req.user!.userId,
      dto,
    );
    return successResponse(data, 'Verified successfully');
  }

  @Get('profile')
  async getProfile(@Req() req: Request) {
    const data = await this.usersService.getProfile(req.user!.userId);
    return successResponse(data, 'Profile fetched successfully');
  }
}
