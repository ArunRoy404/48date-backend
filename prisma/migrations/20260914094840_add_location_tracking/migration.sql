-- Location tracking for the "Set Your Location" onboarding screen and the
-- distance filter on the discovery feed.
--
-- `locationUpdatedAt` makes a stale coordinate distinguishable from a fresh
-- one; `locationPermission` records why coordinates are missing so the app
-- does not re-prompt a user who already refused.

CREATE TYPE "LocationPermission" AS ENUM (
  'NOT_ASKED',
  'WHILE_IN_USE',
  'ONE_TIME',
  'ALWAYS',
  'DENIED',
  'DENIED_FOREVER'
);

ALTER TABLE "users"
  ADD COLUMN "locationUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "locationPermission" "LocationPermission" NOT NULL DEFAULT 'NOT_ASKED';

-- Existing rows that already carry a fix get their update time backfilled to
-- the row's own last-modified time rather than now(), so they are not all
-- reported as freshly located.
UPDATE "users"
   SET "locationUpdatedAt" = "updatedAt",
       "locationPermission" = 'WHILE_IN_USE'
 WHERE "latitude" IS NOT NULL
   AND "longitude" IS NOT NULL;

-- Supports the bounding-box prefilter run before exact distance maths.
CREATE INDEX "users_latitude_longitude_idx" ON "users"("latitude", "longitude");
