-- The three interest lists were free-form text arrays whose allowed values
-- lived only in a DTO. They are now real enums, so the database rejects a value
-- the interests screen never offered, and the values follow the same
-- UPPERCASE_UNDERSCORE convention as every other enum in the schema.
--
-- Existing rows hold display strings ('TV Shows', 'K-Drama', 'Sci-Fi'). The
-- mapping is mechanical: uppercase, then spaces and hyphens become underscores.
-- It is done by joining the array to text and splitting it back rather than
-- with a subquery, because Postgres rejects subqueries in a USING transform.

CREATE TYPE "CreativityInterest" AS ENUM (
  'ART', 'DESIGN', 'MAKEUP', 'PHOTOGRAPHY', 'SINGING'
);

CREATE TYPE "SportInterest" AS ENUM (
  'RUNNING', 'GYM', 'SOCCER', 'CRICKET', 'TENNIS', 'BASKETBALL'
);

CREATE TYPE "MovieAndDramaInterest" AS ENUM (
  'TV_SHOWS', 'ROMANCE', 'COMEDY', 'K_DRAMA', 'HORROR', 'THRILLER',
  'SCI_FI', 'FANTASY', 'ANIME', 'ZOMBIE'
);

ALTER TABLE "users"
  ALTER COLUMN "creativity" DROP DEFAULT,
  ALTER COLUMN "creativity" TYPE "CreativityInterest"[]
  USING (
    CASE WHEN cardinality("creativity") = 0
      THEN ARRAY[]::"CreativityInterest"[]
      ELSE string_to_array(
             upper(replace(replace(array_to_string("creativity", ','), ' ', '_'), '-', '_')),
             ','
           )::"CreativityInterest"[]
    END
  );

ALTER TABLE "users"
  ALTER COLUMN "sports" DROP DEFAULT,
  ALTER COLUMN "sports" TYPE "SportInterest"[]
  USING (
    CASE WHEN cardinality("sports") = 0
      THEN ARRAY[]::"SportInterest"[]
      ELSE string_to_array(
             upper(replace(replace(array_to_string("sports", ','), ' ', '_'), '-', '_')),
             ','
           )::"SportInterest"[]
    END
  );

ALTER TABLE "users"
  ALTER COLUMN "moviesAndDramas" DROP DEFAULT,
  ALTER COLUMN "moviesAndDramas" TYPE "MovieAndDramaInterest"[]
  USING (
    CASE WHEN cardinality("moviesAndDramas") = 0
      THEN ARRAY[]::"MovieAndDramaInterest"[]
      ELSE string_to_array(
             upper(replace(replace(array_to_string("moviesAndDramas", ','), ' ', '_'), '-', '_')),
             ','
           )::"MovieAndDramaInterest"[]
    END
  );

ALTER TABLE "users"
  ALTER COLUMN "creativity" SET DEFAULT ARRAY[]::"CreativityInterest"[],
  ALTER COLUMN "sports" SET DEFAULT ARRAY[]::"SportInterest"[],
  ALTER COLUMN "moviesAndDramas" SET DEFAULT ARRAY[]::"MovieAndDramaInterest"[];
