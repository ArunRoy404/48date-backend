import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
  IsBoolean,
} from 'class-validator';

export class CreateDateRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  behaviorScore: number;

  @IsInt()
  @Min(1)
  @Max(5)
  punctualityScore: number;

  @IsInt()
  @Min(1)
  @Max(5)
  safetyScore: number;

  @IsInt()
  @Min(1)
  @Max(5)
  overallScore: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}
