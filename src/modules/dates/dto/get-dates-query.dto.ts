import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { DateStatus } from '../../../generated/prisma/enums.js';

export class GetDatesQueryDto {
  @IsOptional()
  @IsEnum(DateStatus)
  status?: DateStatus;

  @IsOptional()
  @IsUUID()
  matchId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): boolean => {
    if (value === 'true' || value === true || value === 1 || value === '1') {
      return true;
    }
    return false;
  })
  @IsBoolean()
  upcoming?: boolean;

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
}
