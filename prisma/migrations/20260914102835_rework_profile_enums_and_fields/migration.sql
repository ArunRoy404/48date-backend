-- Aligns the profile model with the onboarding screens.
--
-- 1. LookingFor now carries the four options the "What Are You Looking For?"
--    screen actually offers, replacing five values that were never on it.
-- 2. HabitFrequency drops OFTEN, which the lifestyle screen does not offer.
-- 3. `name` and `locations` are removed — firstName/lastName are the source of
--    truth for a display name, and lastLocation + coordinates cover location.
--
-- Postgres cannot remove or rename enum members in place, so each type is
-- rebuilt and the existing rows are mapped across.

-- --- LookingFor -------------------------------------------------------------
ALTER TYPE "LookingFor" RENAME TO "LookingFor_old";

CREATE TYPE "LookingFor" AS ENUM (
  'REAL_RELATIONSHIP',
  'SOMETHING_MEANINGFUL',
  'SEE_WHERE_IT_GOES',
  'NEW_FRIENDS_FIRST'
);

ALTER TABLE "users"
  ALTER COLUMN "lookingFor" TYPE "LookingFor"
  USING (
    CASE "lookingFor"::text
      WHEN 'LONG_TERM'          THEN 'REAL_RELATIONSHIP'
      WHEN 'SHORT_TERM'         THEN 'SEE_WHERE_IT_GOES'
      WHEN 'CASUAL'             THEN 'SEE_WHERE_IT_GOES'
      WHEN 'FRIENDSHIP'         THEN 'NEW_FRIENDS_FIRST'
      WHEN 'STILL_FIGURING_OUT' THEN 'SOMETHING_MEANINGFUL'
    END
  )::"LookingFor";

DROP TYPE "LookingFor_old";

-- --- HabitFrequency ---------------------------------------------------------
ALTER TYPE "HabitFrequency" RENAME TO "HabitFrequency_old";

CREATE TYPE "HabitFrequency" AS ENUM ('NEVER', 'SOMETIMES', 'DAILY');

-- OFTEN collapses upward into DAILY rather than down into SOMETIMES: it is the
-- nearer of the two, and understating a habit is the worse direction to err.
ALTER TABLE "users"
  ALTER COLUMN "smoker" TYPE "HabitFrequency"
  USING (
    CASE "smoker"::text WHEN 'OFTEN' THEN 'DAILY' ELSE "smoker"::text END
  )::"HabitFrequency";

ALTER TABLE "users"
  ALTER COLUMN "alcohol" TYPE "HabitFrequency"
  USING (
    CASE "alcohol"::text WHEN 'OFTEN' THEN 'DAILY' ELSE "alcohol"::text END
  )::"HabitFrequency";

DROP TYPE "HabitFrequency_old";

-- --- Dropped columns --------------------------------------------------------
ALTER TABLE "users" DROP COLUMN "name";
ALTER TABLE "users" DROP COLUMN "locations";
