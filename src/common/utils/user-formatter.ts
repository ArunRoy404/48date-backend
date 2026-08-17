import type { Image, User } from '../../generated/prisma/client.js';

/**
 * The shape every API response uses for a user profile — grouped by category
 * so clients (Flutter app / admin panel) can render sections directly.
 */
export interface FormattedUser {
  id: string;
  auth: {
    phone: string;
    email: string | null;
    role: 'USER' | 'ADMIN';
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
    isUserVerified: boolean;
  };
  basicProfile: {
    name: string | null;
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
    locations: string[];
    lastLocation: string | null;
  };
  body: {
    heightCm: number | null;
    weightKg: number | null;
  };
  interests: {
    creativity: string[];
    sports: string[];
    moviesAndDramas: string[];
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
 * `passwordHash` is intentionally never included.
 */
export function formatUser(user: User & { images?: Image[] }): FormattedUser {
  return {
    id: user.id,
    auth: {
      phone: user.phone,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      isUserVerified: user.isUserVerified,
    },
    basicProfile: {
      name: user.name,
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
      locations: user.locations,
      lastLocation: user.lastLocation,
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
