import { Global, Module } from '@nestjs/common';
import { OtpService } from './otp.service.js';

/**
 * Global so both the auth module and the users module share one OTP
 * implementation — and therefore one cooldown.
 */
@Global()
@Module({
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
