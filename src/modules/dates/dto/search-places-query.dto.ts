import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchPlacesQueryDto {
  @IsString()
  @IsNotEmpty()
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 10;
}
