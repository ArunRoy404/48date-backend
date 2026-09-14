-- Passwords were removed from the product: login is phone/email + OTP only
-- (`POST /auth/login`), or Google sign-in. There is no register endpoint and
-- no password-reset flow, so nothing can set or read this column any more.
ALTER TABLE "users" DROP COLUMN "passwordHash";
