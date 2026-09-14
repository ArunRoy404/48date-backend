-- Tracks when an OTP was last dispatched, so `POST /auth/login` and
-- `POST /auth/resend-otp` can refuse to send another one within the cooldown
-- window instead of letting a tap-happy client burn SMS credit.
--
-- Left NULL for existing rows: nobody is mid-cooldown at deploy time, and a
-- NULL reads as "no OTP sent yet", which correctly allows the next request.
ALTER TABLE "users" ADD COLUMN "lastOtpSentAt" TIMESTAMP(3);
