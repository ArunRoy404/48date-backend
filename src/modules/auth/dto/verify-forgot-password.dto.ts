import { IsString, Length } from 'class-validator';
import { OtpChannelDto } from './otp-channel.dto.js';

/**
 * Verifies the password-reset OTP and issues a short-lived reset token
 * used by `reset-password`. Public endpoint.
 */
export class VerifyForgotPasswordDto extends OtpChannelDto {
  @IsString()
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  otp: string;
}
