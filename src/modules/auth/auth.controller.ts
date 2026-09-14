import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { VerifyUserInformationDto } from './dto/verify-user-information.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * A-01.1 — login or sign-up. An unknown phone/email creates the account.
   * Always answers with `requiresOtp: true`; tokens come from A-02.
   */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const data = await this.authService.login(dto);
    return successResponse(data, 'OTP sent successfully');
  }

  /**
   * A-01.3 — re-sends the OTP from A-01.1. Refuses inside the 30s cooldown.
   */
  @Post('resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto) {
    const data = await this.authService.resendOtp(dto);
    return successResponse(data, 'OTP resent successfully');
  }

  @Post('google')
  async googleLogin(@Body() dto: GoogleLoginDto) {
    const data = await this.authService.googleLogin(dto);
    return successResponse(data, 'Logged in with Google successfully');
  }

  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    const data = await this.authService.verifyOtp(dto);
    return successResponse(data, 'OTP verified successfully');
  }

  @Post('verify-user-information')
  @UseGuards(JwtAuthGuard)
  async verifyUserInformation(
    @Body() dto: VerifyUserInformationDto,
    @Req() req: Request,
  ) {
    const data = await this.authService.verifyUserInformation(
      req.user!.userId,
      dto,
    );
    return successResponse(data, 'User information verified successfully');
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    const data = await this.authService.refresh(dto);
    return successResponse(data, 'Tokens refreshed successfully');
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout() {
    const data = this.authService.logout();
    return successResponse(data, 'Logged out successfully');
  }
}
