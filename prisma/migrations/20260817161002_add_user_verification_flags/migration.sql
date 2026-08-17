-- Rename verification columns (preserves existing values)
ALTER TABLE "users" RENAME COLUMN "emailVerified" TO "isEmailVerified";
ALTER TABLE "users" RENAME COLUMN "phoneVerified" TO "isPhoneVerified";

-- Add overall verification flag: true when email OR phone is verified
ALTER TABLE "users" ADD COLUMN "isUserVerified" BOOLEAN NOT NULL DEFAULT false;
