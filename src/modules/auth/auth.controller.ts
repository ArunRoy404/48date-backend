import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { AuthService } from './auth.service.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyForgotPasswordDto } from './dto/verify-forgot-password.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const data = await this.authService.register(dto);
    return successResponse(data, 'Account created successfully');
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const data = await this.authService.login(dto);
    const message =
      'requiresOtp' in data && data.requiresOtp
        ? 'OTP sent successfully'
        : 'Logged in successfully';
    return successResponse(data, message);
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

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    const data = this.authService.forgotPassword(dto);
    return successResponse(data, 'Reset OTP sent successfully');
  }

  @Post('verify-forgot-password')
  async verifyForgotPassword(@Body() dto: VerifyForgotPasswordDto) {
    const data = await this.authService.verifyForgotPassword(dto);
    return successResponse(
      data,
      'OTP verified — you can now reset your password',
    );
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const data = await this.authService.resetPassword(dto);
    return successResponse(data, 'Password reset successfully');
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
