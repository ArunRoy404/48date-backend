import { OtpChannelDto } from './otp-channel.dto.js';

/**
 * Requests a verification OTP for an existing account.
 * Public endpoint — takes phone OR email + channel (no auth required).
 */
export class RequestOtpDto extends OtpChannelDto {}
