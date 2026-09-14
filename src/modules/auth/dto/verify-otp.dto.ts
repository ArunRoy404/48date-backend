import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

/**
 * Verifies the OTP sent by `POST /auth/login` and issues the token pair.
 * Public endpoint — phone + otp.
 */
export class VerifyOtpDto {
  @IsString({ message: 'Enter your phone number.' })
  @IsNotEmpty({ message: 'Enter your phone number.' })
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message:
      'Enter your phone number with the country code, for example +8801811000001.',
  })
  phone: string;

  @IsString({ message: 'Enter the 6-digit code we sent you.' })
  @Length(6, 6, { message: 'The code must be exactly 6 digits.' })
  otp: string;
}
