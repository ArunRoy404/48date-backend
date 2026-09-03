import {
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsISO8601,
  IsString,
  IsNumber,
} from 'class-validator';

export class CreateDatePlanDto {
  @IsUUID()
  @IsNotEmpty()
  matchId: string;

  @IsOptional()
  @IsUUID()
  receiverId?: string;

  @IsISO8601()
  @IsNotEmpty()
  date: string;

  @IsISO8601()
  @IsNotEmpty()
  startTime: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsString()
  @IsNotEmpty()
  venueName: string;

  @IsString()
  @IsNotEmpty()
  venueAddress: string;

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
