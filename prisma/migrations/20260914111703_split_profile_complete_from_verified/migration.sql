-- Splits two things that were sharing one column.
--
-- `isUserVerified` was being set automatically the moment a profile looked
-- complete, which conflated "this user filled in the form" with "an admin has
-- vouched for this user". It is now purely admin-controlled, and the new
-- `isProfileComplete` carries the onboarding state.
--
-- Existing rows: anything previously auto-marked verified had, by definition,
-- a complete profile, so that state carries over to the new column. The admin
-- badge is left as it stands rather than being reset, since the seeded demo
-- accounts are meant to be discoverable.
ALTER TABLE "users" ADD COLUMN "isProfileComplete" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users" SET "isProfileComplete" = true WHERE "isUserVerified" = true;

-- Email is only ever verified by Google sign-in or by the profile
-- contact-verification flow. Nothing else could have legitimately set it, so
-- rows that were flagged without going through either are corrected.
UPDATE "users"
   SET "isEmailVerified" = false
 WHERE "isEmailVerified" = true
   AND "email" IS NULL;
