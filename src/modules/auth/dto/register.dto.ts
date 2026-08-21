import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  Gender,
  HabitFrequency,
  KidsStatus,
  LookingFor,
} from '../../../generated/prisma/client.js';

// Fixed interest option lists (from the registration screens).
export const CREATIVITY_INTERESTS = [
  'Art',
  'Design',
  'Makeup',
  'Photography',
  'Singing',
] as const;

export const SPORTS_INTERESTS = [
  'Running',
  'Gym',
  'Soccer',
  'Cricket',
  'Tennis',
  'Basketball',
] as const;

export const MOVIES_AND_DRAMAS_INTERESTS = [
  'TV Shows',
  'Romance',
  'Comedy',
  'K-Drama',
  'Horror',
  'Thriller',
  'Sci-Fi',
  'Fantasy',
  'Anime',
  'Zombie',
] as const;

export class RegisterImageDto {
  @IsUrl({}, { message: 'images[].url must be a valid URL' })
  url: string;

  @IsBoolean({ message: 'images[].isMain must be a boolean' })
  isMain: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * Registration payload — every field is required (matches the registration
 * screens). Profile fields are enforced here at the API level; the DB keeps
 * them nullable for future flexibility (edits, admin-created users).
 */
export class RegisterDto {
  // --- Auth / identity ---
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message:
      'phone must be a valid international number in E.164 format (e.g. +8801...)',
  })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  password: string;

  // --- Basic profile ---
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
    message: 'gender must be one of: MALE, FEMALE, PREFER_NOT_TO_SAY',
  })
  gender?: Gender;

  @IsOptional()
  @IsEnum(Gender, {
    message:
      'interestedIn ("who are you here to meet") must be one of: MALE, FEMALE, PREFER_NOT_TO_SAY',
  })
  interestedIn?: Gender;

  // --- Lifestyle ---
  @IsOptional()
  @IsEnum(HabitFrequency, {
    message: 'smoker must be one of: REGULAR, OCCASIONALLY, NONE',
  })
  smoker?: HabitFrequency;

  @IsOptional()
  @IsEnum(HabitFrequency, {
    message: 'alcohol must be one of: REGULAR, OCCASIONALLY, NONE',
  })
  alcohol?: HabitFrequency;

  @IsOptional()
  @IsEnum(KidsStatus, { message: 'kids must be one of: HAVE, DONT_HAVE' })
  kids?: KidsStatus;

  @IsOptional()
  @IsBoolean()
  wantsKids?: boolean;

  @IsOptional()
  @IsEnum(LookingFor, {
    message:
      'lookingFor must be one of: REAL_RELATIONSHIP, SOMETHING_MEANINGFUL, SEE_WHERE_IT_GOES, NEW_FRIENDS_FIRST',
  })
  lookingFor?: LookingFor;

  // --- Location ---
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locations?: string[];

  @IsOptional()
  @IsString()
  lastLocation?: string;

  // --- Body ---
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

  // --- Interests ---
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

  // --- Media ---
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'images must contain at least 1 photo' })
  @ArrayMaxSize(6, { message: 'images can contain at most 6 photos' })
  @ValidateNested({ each: true })
  @Type(() => RegisterImageDto)
  images?: RegisterImageDto[];

  @IsOptional()
  @IsUrl({}, { message: 'selfieUrl must be a valid URL' })
  selfieUrl?: string;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
