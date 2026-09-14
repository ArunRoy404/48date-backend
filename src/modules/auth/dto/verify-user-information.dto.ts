import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CREATIVITY_INTERESTS,
  MOVIES_AND_DRAMAS_INTERESTS,
  SPORTS_INTERESTS,
} from '../../../common/constants/interests.js';
import { IsPublicUrl } from '../../../common/validators/is-public-url.validator.js';
import {
  Gender,
  HabitFrequency,
  KidsStatus,
  LocationPermission,
  LookingFor,
} from '../../../generated/prisma/client.js';

export class VerifyUserInformationImageDto {
  @IsPublicUrl({ message: 'images[].url must be a valid URL' })
  url: string;

  @IsBoolean({ message: 'images[].isMain must be a boolean' })
  isMain: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * Payload for `POST /auth/verify-user-information`.
 *
 * This is the single onboarding submission the app sends once a user has
 * logged in (A-01.1 / A-01.2) and verified their OTP (A-02) but still has
 * `isUserVerified: false`. Every field the completeness check looks at is
 * REQUIRED here, so a successful call always flips `isUserVerified` to true.
 * Everything else stays optional and can be edited later through
 * `PATCH /users/profile-setup`.
 */
export class VerifyUserInformationDto {
  // --- Identity (required) ---
  @IsString()
  @IsNotEmpty({ message: 'firstName is required' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'lastName is required' })
  lastName: string;

  @IsString()
  @IsNotEmpty({ message: 'username is required' })
  username: string;

  @IsDateString({}, { message: 'birthDate must be a valid ISO date' })
  birthDate: string;

  @IsEnum(Gender, {
    message: 'gender must be one of: MALE, FEMALE, NON_BINARY, OTHER',
  })
  gender: Gender;

  @IsEnum(Gender, {
    message:
      'interestedIn ("who are you here to meet") must be one of: MALE, FEMALE, NON_BINARY, OTHER',
  })
  interestedIn: Gender;

  @IsEnum(LookingFor, {
    message:
      'lookingFor must be one of: LONG_TERM, SHORT_TERM, FRIENDSHIP, CASUAL, STILL_FIGURING_OUT',
  })
  lookingFor: LookingFor;

  @IsArray()
  @ArrayMinSize(1, { message: 'locations must contain at least 1 entry' })
  @IsString({ each: true })
  locations: string[];

  @IsArray()
  @ArrayMinSize(1, { message: 'images must contain at least 1 photo' })
  @ArrayMaxSize(6, { message: 'images can contain at most 6 photos' })
  @ValidateNested({ each: true })
  @Type(() => VerifyUserInformationImageDto)
  images: VerifyUserInformationImageDto[];

  // --- Display name (optional — derived from firstName + lastName when omitted) ---
  @IsOptional()
  @IsString()
  name?: string;

  // --- Lifestyle (optional) ---
  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsEnum(HabitFrequency, {
    message: 'smoker must be one of: NEVER, SOMETIMES, OFTEN, DAILY',
  })
  smoker?: HabitFrequency;

  @IsOptional()
  @IsEnum(HabitFrequency, {
    message: 'alcohol must be one of: NEVER, SOMETIMES, OFTEN, DAILY',
  })
  alcohol?: HabitFrequency;

  @IsOptional()
  @IsEnum(KidsStatus, {
    message:
      'kids must be one of: HAS_KIDS, DOESNT_HAVE_KIDS, PREFER_NOT_TO_SAY',
  })
  kids?: KidsStatus;

  @IsOptional()
  @IsBoolean()
  wantsKids?: boolean;

  // --- Location (optional) ---
  @IsOptional()
  @IsString()
  lastLocation?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsEnum(LocationPermission, {
    message:
      'locationPermission must be one of: NOT_ASKED, WHILE_IN_USE, ONE_TIME, ALWAYS, DENIED, DENIED_FOREVER',
  })
  locationPermission?: LocationPermission;

  // --- Body (optional) ---
  @IsOptional()
  @IsInt()
  @Min(50, { message: 'heightCm must be between 50 and 250' })
  @Max(250, { message: 'heightCm must be between 50 and 250' })
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(20, { message: 'weightKg must be between 20 and 300' })
  @Max(300, { message: 'weightKg must be between 20 and 300' })
  weightKg?: number;

  // --- Interests (optional) ---
  @IsOptional()
  @IsArray()
  @IsIn(CREATIVITY_INTERESTS, {
    each: true,
    message: `creativity can only contain: ${CREATIVITY_INTERESTS.join(', ')}`,
  })
  creativity?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(SPORTS_INTERESTS, {
    each: true,
    message: `sports can only contain: ${SPORTS_INTERESTS.join(', ')}`,
  })
  sports?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(MOVIES_AND_DRAMAS_INTERESTS, {
    each: true,
    message: `moviesAndDramas can only contain: ${MOVIES_AND_DRAMAS_INTERESTS.join(', ')}`,
  })
  moviesAndDramas?: string[];

  // --- Media & prefs (optional) ---
  @IsOptional()
  @IsPublicUrl({ message: 'selfieUrl must be a valid URL' })
  selfieUrl?: string;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
