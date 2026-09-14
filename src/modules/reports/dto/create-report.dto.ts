import {
  IsUUID,
  IsNotEmpty,
  IsString,
  IsOptional,
  MaxLength,
  IsBoolean,
} from 'class-validator';

export class CreateReportDto {
  @IsUUID()
  @IsNotEmpty()
  reportedUserId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  blockUser?: boolean;
}
