import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Gender } from '../../../generated/prisma/enums.js';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsInt({ message: 'minAge must be an integer' })
  @Min(18, { message: 'minAge must be at least 18' })
  @Max(99, { message: 'minAge must be at most 99' })
  minAge?: number;

  @IsOptional()
  @IsInt({ message: 'maxAge must be an integer' })
  @Min(18, { message: 'maxAge must be at least 18' })
  @Max(99, { message: 'maxAge must be at most 99' })
  maxAge?: number;

  @IsOptional()
  @IsInt({ message: 'maxDistanceKm must be an integer' })
  @Min(1, { message: 'maxDistanceKm must be at least 1' })
  maxDistanceKm?: number;

  @IsOptional()
  @IsEnum(Gender, {
    message: 'preferredGender must be one of: MALE, FEMALE, PREFER_NOT_TO_SAY',
  })
  preferredGender?: Gender;
}
