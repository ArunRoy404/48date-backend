import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { LocationPermission } from '../../../generated/prisma/client.js';

/**
 * Payload for `PATCH /users/location`.
 *
 * Location refreshes on almost every app open, so it gets its own small
 * endpoint rather than riding along with the whole profile — sending the
 * entire profile to move a coordinate risks clobbering unrelated fields.
 *
 * Every field is optional because there are two valid calls:
 * - a fix was obtained → `latitude` + `longitude` (+ `city`, + `permission`)
 * - the prompt was refused → `permission` alone, with no coordinates
 *
 * `latitude` and `longitude` must be sent together; the service rejects one
 * without the other, since half a coordinate is not a position.
 */
export class UpdateLocationDto {
  @IsOptional()
  @IsNumber({}, { message: 'latitude must be a number' })
  @Min(-90, { message: 'latitude must be between -90 and 90' })
  @Max(90, { message: 'latitude must be between -90 and 90' })
  latitude?: number;

  @IsOptional()
  @IsNumber({}, { message: 'longitude must be a number' })
  @Min(-180, { message: 'longitude must be between -180 and 180' })
  @Max(180, { message: 'longitude must be between -180 and 180' })
  longitude?: number;

  /** Reverse-geocoded place name. The app resolves it; the API just stores it. */
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(LocationPermission, {
    message:
      'permission must be one of: NOT_ASKED, WHILE_IN_USE, ONE_TIME, ALWAYS, DENIED, DENIED_FOREVER',
  })
  permission?: LocationPermission;
}
