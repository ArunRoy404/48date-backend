import { IsString, Length } from 'class-validator';
import { OtpChannelDto } from './otp-channel.dto.js';

/**
 * Verifies an OTP for an existing account and flips the matching
 * verification flag. Public endpoint — phone OR email + channel + otp.
 */
export class VerifyOtpDto extends OtpChannelDto {
  @IsString()
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  otp: string;
}
