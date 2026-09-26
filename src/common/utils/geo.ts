/**
 * Great-circle distance helpers for the discovery feed.
 *
 * Deliberately dependency-free and PostGIS-free: the feed narrows candidates
 * with a bounding box the database can serve from a plain btree index, then
 * computes exact distances in memory over that much smaller set. If the user
 * base grows past the point where a bounding box is selective enough, the
 * replacement is a PostGIS `geography` column and `ST_DWithin` — at which
 * point only `buildBoundingBox` and its caller need to change.
 */

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LATITUDE = 111.32;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
): number {
  const dLat = toRadians(latB - latA);
  const dLon = toRadians(lonB - lonA);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latA)) *
      Math.cos(toRadians(latB)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  /** True when the box spans the ±180° meridian and needs an OR in SQL. */
  wrapsAntimeridian: boolean;
}

/**
 * A latitude/longitude box guaranteed to contain every point within
 * `radiusKm` of the centre. It over-selects — corners of the box are further
 * away than the radius — which is why callers still filter with
 * `haversineKm` afterwards.
 */
export function buildBoundingBox(
  latitude: number,
  longitude: number,
  radiusKm: number,
): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LATITUDE;

  // A degree of longitude shrinks towards the poles. Clamping cos() keeps the
  // division finite for a user sitting on one.
  const cosLat = Math.max(Math.cos(toRadians(latitude)), 0.01);
  const lonDelta = radiusKm / (KM_PER_DEGREE_LATITUDE * cosLat);

  const minLatitude = Math.max(latitude - latDelta, -90);
  const maxLatitude = Math.min(latitude + latDelta, 90);

  const rawMinLon = longitude - lonDelta;
  const rawMaxLon = longitude + lonDelta;
  const wrapsAntimeridian = rawMinLon < -180 || rawMaxLon > 180;

  return {
    minLatitude,
    maxLatitude,
    // When the box wraps, the two halves are handled by the caller; the
    // normalised edges below are what each half is clamped to.
    minLongitude: wrapsAntimeridian ? -180 : rawMinLon,
    maxLongitude: wrapsAntimeridian ? 180 : rawMaxLon,
    wrapsAntimeridian,
  };
}

/** Rounds to one decimal place — enough for "3.2 km away", and it avoids
 * handing clients a false sense of precision about someone else's position. */
export function roundDistanceKm(km: number): number {
  return Math.round(km * 10) / 10;
}
