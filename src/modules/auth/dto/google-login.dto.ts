import { IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsString({ message: 'idToken must be a string' })
  idToken: string;
}
