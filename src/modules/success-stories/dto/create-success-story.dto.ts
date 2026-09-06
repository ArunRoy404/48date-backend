import {
  IsUUID,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateSuccessStoryDto {
  @IsUUID()
  @IsNotEmpty()
  partnerId: string;

  @IsOptional()
  @IsUUID()
  matchId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  @MaxLength(5000)
  story: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
