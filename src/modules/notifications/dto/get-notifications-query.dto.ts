import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '../../../generated/prisma/client.js';

export class GetNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  /** `true` → only unread rows (the badge screen). */
  @IsOptional()
  @Type(() => Boolean)
  unread?: boolean;

  @IsOptional()
  @IsEnum(NotificationType, {
    message:
      'type must be one of: MATCH, MESSAGE, DATE_REMINDER, DATE_INVITE, SUBSCRIPTION, SYSTEM.',
  })
  type?: NotificationType;
}
