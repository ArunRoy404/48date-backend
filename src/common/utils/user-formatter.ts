import type {
  CreativityInterest,
  Image,
  MovieAndDramaInterest,
  SportInterest,
  User,
} from '../../generated/prisma/client.js';

/**
 * Builds the name shown in the UI from its two parts.
 *
 * The `name` column was removed — firstName/lastName are the source of truth,
 * so anything that needs a single string derives it here rather than keeping a
 * third copy that can drift out of sync with the other two.
 */
export function displayName(user: {
  firstName: string | null;
  lastName: string | null;
}): string | null {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full.length > 0 ? full : null;
}

/**
 * The shape every API response uses for a user profile — grouped by category
 * so clients (Flutter app / admin panel) can render sections directly.
 */
export interface FormattedUser {
  id: string;
  auth: {
    phone: string | null;
    email: string | null;
    role: 'USER' | 'ADMIN';
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
    /** Set by A-03 once onboarding lands. */
    isProfileComplete: boolean;
    /** Admin-granted trust badge — never set by a user-facing endpoint. */
    isUserVerified: boolean;
  };
  basicProfile: {
    /** firstName + lastName, or null when neither is set yet. */
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    birthDate: Date | null;
    occupation: string | null;
    gender: string | null;
    interestedIn: string | null;
  };
  lifestyle: {
    smoker: string | null;
    alcohol: string | null;
    kids: string | null;
    wantsKids: boolean | null;
    lookingFor: string | null;
  };
  location: {
    lastLocation: string | null;
    locationUpdatedAt: Date | null;
    locationPermission: string;
    /**
     * Great-circle distance from the *viewer*, in kilometres, rounded to one
     * decimal. Only the discovery feed sets it; everywhere else it is null.
     * Raw coordinates are deliberately never exposed — distance is as precise
     * as another user's position gets.
     */
    distanceKm: number | null;
  };
  body: {
    heightCm: number | null;
    weightKg: number | null;
  };
  interests: {
    creativity: CreativityInterest[];
    sports: SportInterest[];
    moviesAndDramas: MovieAndDramaInterest[];
  };
  media: {
    images: Image[];
    selfieUrl: string | null;
    selfieVerified: boolean;
    notificationsEnabled: boolean;
  };
  meta: {
    subscriptionId: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Formats a user row into the categorized response shape.
 * There is no password on the model — login is phone + OTP only.
 */
export interface FormatUserOptions {
  /** Set by the discovery feed, which is the only caller that knows who is
   * looking and can therefore compute a distance. */
  distanceKm?: number | null;
}

export function formatUser(
  user: User & { images?: Image[] },
  options: FormatUserOptions = {},
): FormattedUser {
  return {
    id: user.id,
    auth: {
      phone: user.phone,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      isProfileComplete: user.isProfileComplete,
      isUserVerified: user.isUserVerified,
    },
    basicProfile: {
      displayName: displayName(user),
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      birthDate: user.birthDate,
      occupation: user.occupation,
      gender: user.gender,
      interestedIn: user.interestedIn,
    },
    lifestyle: {
      smoker: user.smoker,
      alcohol: user.alcohol,
      kids: user.kids,
      wantsKids: user.wantsKids,
      lookingFor: user.lookingFor,
    },
    location: {
      lastLocation: user.lastLocation,
      locationUpdatedAt: user.locationUpdatedAt,
      locationPermission: user.locationPermission,
      distanceKm: options.distanceKm ?? null,
    },
    body: {
      heightCm: user.heightCm,
      weightKg: user.weightKg,
    },
    interests: {
      creativity: user.creativity,
      sports: user.sports,
      moviesAndDramas: user.moviesAndDramas,
    },
    media: {
      images: user.images ?? [],
      selfieUrl: user.selfieUrl,
      selfieVerified: user.selfieVerified,
      notificationsEnabled: user.notificationsEnabled,
    },
    meta: {
      subscriptionId: user.subscriptionId,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  };
}
