import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { IsPublicUrl } from '../../../common/validators/is-public-url.validator.js';
import {
  CreativityInterest,
  Gender,
  HabitFrequency,
  KidsStatus,
  LocationPermission,
  LookingFor,
  MovieAndDramaInterest,
  SportInterest,
} from '../../../generated/prisma/client.js';

export class ProfileImageDto {
  @IsPublicUrl({ message: 'images[].url must be a valid URL' })
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
    message: 'Smoking must be one of: NEVER, SOMETIMES, DAILY.',
  })
  smoker?: HabitFrequency;

  @IsOptional()
  @IsEnum(HabitFrequency, {
    message: 'Drinking must be one of: NEVER, SOMETIMES, DAILY.',
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
      'What you are looking for must be one of: REAL_RELATIONSHIP, SOMETHING_MEANINGFUL, SEE_WHERE_IT_GOES, NEW_FRIENDS_FIRST.',
  })
  lookingFor?: LookingFor;

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
  @IsEnum(CreativityInterest, {
    each: true,
    message: `creativity can only contain: ${Object.values(CreativityInterest).join(', ')}`,
  })
  creativity?: CreativityInterest[];

  @IsOptional()
  @IsArray()
  @IsEnum(SportInterest, {
    each: true,
    message: `sports can only contain: ${Object.values(SportInterest).join(', ')}`,
  })
  sports?: SportInterest[];

  @IsOptional()
  @IsArray()
  @IsEnum(MovieAndDramaInterest, {
    each: true,
    message: `moviesAndDramas can only contain: ${Object.values(MovieAndDramaInterest).join(', ')}`,
  })
  moviesAndDramas?: MovieAndDramaInterest[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'images must contain at least 1 photo' })
  @ArrayMaxSize(6, { message: 'images can contain at most 6 photos' })
  @ValidateNested({ each: true })
  @Type(() => ProfileImageDto)
  images?: ProfileImageDto[];

  @IsOptional()
  @IsPublicUrl({ message: 'selfieUrl must be a valid URL' })
  selfieUrl?: string;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
