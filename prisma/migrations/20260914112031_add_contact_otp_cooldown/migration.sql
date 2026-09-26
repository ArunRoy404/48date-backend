-- The profile contact-verification flow gets its own cooldown timer.
--
-- Sharing `lastOtpSentAt` with login meant that signing in and then adding an
-- email address left the user unable to verify it for 30 seconds — two
-- unrelated actions competing for one rate limit.
ALTER TABLE "users" ADD COLUMN "lastContactOtpSentAt" TIMESTAMP(3);
