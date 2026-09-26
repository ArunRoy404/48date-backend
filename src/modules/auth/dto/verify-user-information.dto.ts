import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
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

// One sentence per field, reused by every validator on it — see the note on
// `stopAtFirstError` in main.ts.
const USERNAME_MESSAGE =
  'Choose a username: 3-30 characters, letters, numbers and underscores only.';
const CREATIVITY_MESSAGE = `Pick at least one creative interest from: ${Object.values(CreativityInterest).join(', ')}.`;
const SPORTS_MESSAGE = `Pick at least one sport from: ${Object.values(SportInterest).join(', ')}.`;
const MOVIES_MESSAGE = `Pick at least one from: ${Object.values(MovieAndDramaInterest).join(', ')}.`;
const IMAGES_MESSAGE =
  'Add 1 to 6 photos, with exactly one marked as the main photo.';

/** Permission values that mean the device actually handed over a position. */
const GRANTED_PERMISSIONS: LocationPermission[] = [
  LocationPermission.WHILE_IN_USE,
  LocationPermission.ONE_TIME,
  LocationPermission.ALWAYS,
];

export class VerifyUserInformationImageDto {
  @IsPublicUrl({ message: 'Each photo needs a valid image URL.' })
  url: string;

  @IsBoolean({ message: 'Each photo needs isMain set to true or false.' })
  isMain: boolean;

  @IsInt({ message: 'Photo order must be a whole number.' })
  @Min(0, { message: 'Photo order cannot be negative.' })
  sortOrder: number;
}

/**
 * Payload for `POST /auth/verify-user-information` — the single onboarding
 * submission sent once the user has logged in and `isUserVerified` is false.
 *
 * **Every field is required.** The onboarding screens collect all of it, so a
 * partial submission means a screen was skipped, and the API says which one
 * rather than silently storing half a profile. Later edits go through
 * `PATCH /users/profile-setup` (P-02), which accepts any subset.
 *
 * The one conditional is location: `latitude`, `longitude` and `lastLocation`
 * are required only when `locationPermission` says the device granted access.
 * A user who taps "Deny" must still be able to finish onboarding.
 *
 * Validation messages are written to be shown to the user as-is.
 *
 * Field order matches the onboarding screen order.
 */
export class VerifyUserInformationDto {
  // --- Location -------------------------------------------------------------

  @ValidateIf((o: VerifyUserInformationDto) =>
    GRANTED_PERMISSIONS.includes(o.locationPermission),
  )
  @IsString({ message: 'Tell us which city you are in.' })
  @IsNotEmpty({ message: 'Tell us which city you are in.' })
  lastLocation: string;

  @ValidateIf((o: VerifyUserInformationDto) =>
    GRANTED_PERMISSIONS.includes(o.locationPermission),
  )
  @IsNumber({}, { message: 'Latitude must be a number.' })
  @Min(-90, { message: 'Latitude must be between -90 and 90.' })
  @Max(90, { message: 'Latitude must be between -90 and 90.' })
  latitude: number;

  @ValidateIf((o: VerifyUserInformationDto) =>
    GRANTED_PERMISSIONS.includes(o.locationPermission),
  )
  @IsNumber({}, { message: 'Longitude must be a number.' })
  @Min(-180, { message: 'Longitude must be between -180 and 180.' })
  @Max(180, { message: 'Longitude must be between -180 and 180.' })
  longitude: number;

  @IsEnum(LocationPermission, {
    message:
      'Location permission must be one of: NOT_ASKED, WHILE_IN_USE, ONE_TIME, ALWAYS, DENIED, DENIED_FOREVER.',
  })
  locationPermission: LocationPermission;

  // --- Identity -------------------------------------------------------------

  @IsString({ message: USERNAME_MESSAGE })
  @IsNotEmpty({ message: USERNAME_MESSAGE })
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message: USERNAME_MESSAGE,
  })
  username: string;

  @IsString({ message: 'Enter your first name.' })
  @IsNotEmpty({ message: 'Enter your first name.' })
  firstName: string;

  @IsString({ message: 'Enter your last name.' })
  @IsNotEmpty({ message: 'Enter your last name.' })
  lastName: string;

  @IsDateString(
    {},
    { message: 'Enter your date of birth in YYYY-MM-DD format.' },
  )
  birthDate: string;

  @IsString({ message: 'Tell us what you do.' })
  @IsNotEmpty({ message: 'Tell us what you do.' })
  occupation: string;

  // --- Lifestyle ------------------------------------------------------------

  @IsEnum(HabitFrequency, {
    message: 'Smoking must be one of: NEVER, SOMETIMES, DAILY.',
  })
  smoker: HabitFrequency;

  @IsEnum(HabitFrequency, {
    message: 'Drinking must be one of: NEVER, SOMETIMES, DAILY.',
  })
  alcohol: HabitFrequency;

  @IsEnum(Gender, {
    message: 'Gender must be one of: MALE, FEMALE, NON_BINARY, OTHER.',
  })
  gender: Gender;

  @IsEnum(KidsStatus, {
    message:
      'Kids must be one of: HAS_KIDS, DOESNT_HAVE_KIDS, PREFER_NOT_TO_SAY.',
  })
  kids: KidsStatus;

  @IsBoolean({ message: 'Tell us whether you want kids — true or false.' })
  wantsKids: boolean;

  // --- Interests ------------------------------------------------------------

  @IsEnum(Gender, {
    message:
      'Who you want to meet must be one of: MALE, FEMALE, NON_BINARY, OTHER.',
  })
  interestedIn: Gender;

  @IsArray({ message: CREATIVITY_MESSAGE })
  @ArrayNotEmpty({ message: CREATIVITY_MESSAGE })
  @IsEnum(CreativityInterest, { each: true, message: CREATIVITY_MESSAGE })
  creativity: CreativityInterest[];

  @IsArray({ message: SPORTS_MESSAGE })
  @ArrayNotEmpty({ message: SPORTS_MESSAGE })
  @IsEnum(SportInterest, { each: true, message: SPORTS_MESSAGE })
  sports: SportInterest[];

  @IsArray({ message: MOVIES_MESSAGE })
  @ArrayNotEmpty({ message: MOVIES_MESSAGE })
  @IsEnum(MovieAndDramaInterest, { each: true, message: MOVIES_MESSAGE })
  moviesAndDramas: MovieAndDramaInterest[];

  // --- Body -----------------------------------------------------------------

  @IsInt({ message: 'Height must be a whole number in centimetres.' })
  @Min(50, { message: 'Height must be between 50 and 250 cm.' })
  @Max(250, { message: 'Height must be between 50 and 250 cm.' })
  heightCm: number;

  @IsInt({ message: 'Weight must be a whole number in kilograms.' })
  @Min(20, { message: 'Weight must be between 20 and 300 kg.' })
  @Max(300, { message: 'Weight must be between 20 and 300 kg.' })
  weightKg: number;

  @IsEnum(LookingFor, {
    message:
      'What you are looking for must be one of: REAL_RELATIONSHIP, SOMETHING_MEANINGFUL, SEE_WHERE_IT_GOES, NEW_FRIENDS_FIRST.',
  })
  lookingFor: LookingFor;

  // --- Media ----------------------------------------------------------------

  @IsArray({ message: IMAGES_MESSAGE })
  @ArrayMinSize(1, { message: IMAGES_MESSAGE })
  @ArrayMaxSize(6, { message: IMAGES_MESSAGE })
  @ValidateNested({ each: true })
  @Type(() => VerifyUserInformationImageDto)
  images: VerifyUserInformationImageDto[];

  @IsBoolean({ message: 'Notifications must be true or false.' })
  notificationsEnabled: boolean;

  /** The selfie used for face verification. Stored on the user as `selfieUrl`. */
  @IsPublicUrl({ message: 'Add a selfie for verification.' })
  selfieVerificationImageUrl: string;
}
