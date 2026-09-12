import {
  IsEmail,
  IsIn,
  IsOptional,
  Matches,
  ValidateIf,
} from 'class-validator';

/**
 * Shared fields for every OTP request: the delivery channel plus the
 * identifier for that channel (email for `email`, phone for `phone`).
 * Either `phone` or `email` can be provided.
 */
export class OtpChannelDto {
  @IsOptional()
  @IsIn(['email', 'phone'], {
    message: 'channel must be either "email" or "phone"',
  })
  channel?: 'email' | 'phone';

  @ValidateIf(
    (o: OtpChannelDto) => o.channel === 'email' || (!o.channel && !o.phone),
  )
  @IsOptional()
  @IsEmail(
    {},
    { message: 'email must be a valid email address when channel is "email"' },
  )
  email?: string;

  @ValidateIf(
    (o: OtpChannelDto) => o.channel === 'phone' || (!o.channel && !o.email),
  )
  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message:
      'phone must be a valid international number in E.164 format when channel is "phone"',
  })
  phone?: string;
}
