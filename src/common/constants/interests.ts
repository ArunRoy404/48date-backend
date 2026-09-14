/**
 * Fixed interest option lists shown on the profile screens.
 *
 * These live outside any module's DTO folder because both
 * `POST /auth/verify-user-information` and `PATCH /users/profile-setup`
 * validate against them.
 */

export const CREATIVITY_INTERESTS = [
  'Art',
  'Design',
  'Makeup',
  'Photography',
  'Singing',
] as const;

export const SPORTS_INTERESTS = [
  'Running',
  'Gym',
  'Soccer',
  'Cricket',
  'Tennis',
  'Basketball',
] as const;

export const MOVIES_AND_DRAMAS_INTERESTS = [
  'TV Shows',
  'Romance',
  'Comedy',
  'K-Drama',
  'Horror',
  'Thriller',
  'Sci-Fi',
  'Fantasy',
  'Anime',
  'Zombie',
] as const;
