import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelDateDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
