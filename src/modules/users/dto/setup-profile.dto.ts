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
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import {
  Gender,
  HabitFrequency,
  KidsStatus,
  LookingFor,
} from '../../../generated/prisma/client.js';
import {
  CREATIVITY_INTERESTS,
  SPORTS_INTERESTS,
  MOVIES_AND_DRAMAS_INTERESTS,
} from '../../auth/dto/register.dto.js';

export class ProfileImageDto {
  @IsUrl({}, { message: 'images[].url must be a valid URL' })
  url: string;

  @IsBoolean({ message: 'images[].isMain must be a boolean' })
  isMain: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SetupProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsDateString({}, { message: 'birthDate must be a valid ISO date' })
  birthDate?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsEnum(Gender, {
    message: 'gender must be one of: MALE, FEMALE, NON_BINARY, OTHER',
  })
  gender?: Gender;

  @IsOptional()
  @IsEnum(Gender, {
    message: 'interestedIn must be one of: MALE, FEMALE, NON_BINARY, OTHER',
  })
  interestedIn?: Gender;

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

  @IsOptional()
  @IsEnum(LookingFor, {
    message:
      'lookingFor must be one of: LONG_TERM, SHORT_TERM, FRIENDSHIP, CASUAL, STILL_FIGURING_OUT',
  })
  lookingFor?: LookingFor;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locations?: string[];

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
  @IsInt()
  @Min(50, { message: 'heightCm must be between 50 and 250' })
  @Max(250, { message: 'heightCm must be between 50 and 250' })
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(20, { message: 'weightKg must be between 20 and 300' })
  @Max(300, { message: 'weightKg must be between 20 and 300' })
  weightKg?: number;

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

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'images must contain at least 1 photo' })
  @ArrayMaxSize(6, { message: 'images can contain at most 6 photos' })
  @ValidateNested({ each: true })
  @Type(() => ProfileImageDto)
  images?: ProfileImageDto[];

  @IsOptional()
  @IsUrl({}, { message: 'selfieUrl must be a valid URL' })
  selfieUrl?: string;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
