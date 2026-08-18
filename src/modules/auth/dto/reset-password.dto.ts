import { IsString, MinLength } from 'class-validator';

/**
 * Sets a new password using the reset token issued by
 * `verify-forgot-password`. Public endpoint.
 */
export class ResetPasswordDto {
  @IsString()
  resetToken: string;

  @IsString()
  @MinLength(8, { message: 'newPassword must be at least 8 characters' })
  newPassword: string;
}
