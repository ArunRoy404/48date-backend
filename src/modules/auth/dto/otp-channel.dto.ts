import { IsEmail, IsIn, Matches, ValidateIf } from 'class-validator';

/**
 * Shared fields for every OTP request: the delivery channel plus the
 * identifier for that channel (email for `email`, phone for `phone`).
 * Exactly one of `email` / `phone` must be provided and it must match
 * the chosen channel.
 */
export class OtpChannelDto {
  @IsIn(['email', 'phone'], {
    message: 'channel must be either "email" or "phone"',
  })
  channel: 'email' | 'phone';

  @ValidateIf((o: { channel?: string }) => o.channel === 'email')
  @IsEmail(
    {},
    { message: 'email must be a valid email address when channel is "email"' },
  )
  email?: string;

  @ValidateIf((o: { channel?: string }) => o.channel === 'phone')
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message:
      'phone must be a valid international number in E.164 format when channel is "phone"',
  })
  phone?: string;
}
