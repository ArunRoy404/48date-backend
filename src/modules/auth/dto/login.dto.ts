import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Login payload — a phone number, nothing else.
 *
 * There is no registration endpoint: a number the server has not seen creates
 * the account. Login never returns tokens; it always dispatches an OTP and the
 * client continues with `POST /auth/verify-otp` (A-02).
 *
 * Email is not a login channel. Google sign-in (A-01.2) is the only route that
 * starts from an email address.
 */
export class LoginDto {
  @IsString({ message: 'Enter your phone number.' })
  @IsNotEmpty({ message: 'Enter your phone number.' })
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message:
      'Enter your phone number with the country code, for example +8801811000001.',
  })
  phone: string;
}
