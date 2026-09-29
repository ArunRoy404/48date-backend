import { IsEnum, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Platform } from '../../../generated/prisma/client.js';

export class RegisterDeviceDto {
  /** The FCM registration token — unique per device install. */
  @IsString({ message: 'fcmToken must be a string.' })
  @IsNotEmpty({ message: 'fcmToken is required.' })
  @MaxLength(4096, { message: 'fcmToken is too long to be valid.' })
  fcmToken: string;

  @IsEnum(Platform, { message: 'platform must be one of: IOS, ANDROID.' })
  platform: Platform;
}
