import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ActionType } from '../../../generated/prisma/enums.js';

export class SwipeDto {
  @IsNotEmpty({ message: 'targetUserId is required' })
  @IsString({ message: 'targetUserId must be a string' })
  targetUserId: string;

  @IsNotEmpty({ message: 'action is required' })
  @IsEnum(ActionType, {
    message: 'action must be one of: LIKE, PASS, SUPER_LIKE',
  })
  action: ActionType;
}
