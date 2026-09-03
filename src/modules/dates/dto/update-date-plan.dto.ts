import { IsOptional, IsISO8601, IsString, IsNumber } from 'class-validator';

export class UpdateDatePlanDto {
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @IsString()
  venueName?: string;

  @IsOptional()
  @IsString()
  venueAddress?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  mapboxPlaceId?: string;
}
