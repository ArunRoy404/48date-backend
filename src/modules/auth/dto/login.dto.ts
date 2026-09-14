import { OtpChannelDto } from './otp-channel.dto.js';

/**
 * Login payload — phone OR email, nothing else.
 *
 * There is no registration endpoint: an unknown identifier creates the
 * account on the spot. Login never returns tokens; it always dispatches an
 * OTP and the client continues with `POST /auth/verify-otp` (A-02).
 */
export class LoginDto extends OtpChannelDto {}
