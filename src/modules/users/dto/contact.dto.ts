import { IsIn, IsString, Length } from 'class-validator';
import { IsContactValue } from '../../../common/validators/is-contact-value.validator.js';

/** Which identifier a contact request is about. */
export const CONTACT_TYPES = ['PHONE', 'EMAIL'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

const TYPE_MESSAGE = 'Choose either PHONE or EMAIL.';

/**
 * Adds or replaces the phone number or email address on the signed-in account.
 *
 * Whichever one is written lands **unverified** — `isPhoneVerified` /
 * `isEmailVerified` go to false. Proving it is a separate two-step flow:
 * `POST /users/contact/request-otp` then `POST /users/contact/verify-otp`.
 */
export class AddContactDto {
  @IsIn(CONTACT_TYPES, { message: TYPE_MESSAGE })
  type: ContactType;

  /** Validated against `type` — E.164 for PHONE, an address for EMAIL. */
  @IsContactValue()
  value: string;
}

/** Sends a verification code to the stored phone or email. */
export class RequestContactOtpDto {
  @IsIn(CONTACT_TYPES, { message: TYPE_MESSAGE })
  type: ContactType;
}

/** Confirms the code and flips the matching verification flag. */
export class VerifyContactOtpDto {
  @IsIn(CONTACT_TYPES, { message: TYPE_MESSAGE })
  type: ContactType;

  @IsString({ message: 'Enter the 6-digit code we sent you.' })
  @Length(6, 6, { message: 'The code must be exactly 6 digits.' })
  otp: string;
}
