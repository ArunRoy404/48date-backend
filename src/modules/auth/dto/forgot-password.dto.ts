import { OtpChannelDto } from './otp-channel.dto.js';

/**
 * Requests a password-reset OTP. Public endpoint — takes phone OR email
 * + channel (no auth required, no account enumeration).
 */
export class ForgotPasswordDto extends OtpChannelDto {}
