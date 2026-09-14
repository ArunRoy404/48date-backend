import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Re-sends the OTP for an account that already exists.
 *
 * Unlike `POST /auth/login` this never creates an account — a number with no
 * account is a 404, because "resend" implies something was already sent.
 */
export class ResendOtpDto {
  @IsString({ message: 'Enter your phone number.' })
  @IsNotEmpty({ message: 'Enter your phone number.' })
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message:
      'Enter your phone number with the country code, for example +8801811000001.',
  })
  phone: string;
}
