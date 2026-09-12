import { IsOptional, IsString } from 'class-validator';

export class VerifySelfieDto {
  @IsOptional()
  @IsString({ message: 'selfieUrl must be a string URL' })
  selfieUrl?: string;
}
