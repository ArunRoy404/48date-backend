import {
  CreativityInterest,
  Gender,
  HabitFrequency,
  KidsStatus,
  LocationPermission,
  LookingFor,
  MovieAndDramaInterest,
  Platform,
  SportInterest,
} from '../../src/generated/prisma/enums.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * A deliberately *incomplete* account, reset on every seed run.
 *
 * Log in with this phone (A-01.1 → A-02) and the token you get back reports
 * `isUserVerified: false`, so `POST /auth/verify-user-information` (A-03) has
 * a real target. Re-seeding wipes the profile again, so A-03 is repeatable.
 */
export const NEWCOMER_PHONE = '+8801811000008';

/** Image host used by the seed. Real uploads replace these. */
const CDN = 'https://cdn.48date.app/demo';

export interface SeedUser {
  key: string;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  birthDate: string;
  occupation: string;
  gender: Gender;
  interestedIn: Gender;
  smoker: HabitFrequency;
  alcohol: HabitFrequency;
  kids: KidsStatus;
  wantsKids: boolean;
  lookingFor: LookingFor;
  lastLocation: string;
  latitude: number;
  longitude: number;
  heightCm: number;
  weightKg: number;
  creativity: CreativityInterest[];
  sports: SportInterest[];
  moviesAndDramas: MovieAndDramaInterest[];
  images: string[];
  trustScore: number;
}

/**
 * Six demo accounts, all fully verified so they are visible in Discovery.
 *
 * `ava` is the account the Postman collection logs in as. The others exist so
 * that every endpoint has something real to return: two unswiped candidates for
 * the discovery feed, two matches, a blocked user and a story partner.
 */
export const SEED_USERS: SeedUser[] = [
  {
    key: 'ava',
    phone: '+8801811000001',
    email: 'ava.stone@example.com',
    firstName: 'Ava',
    lastName: 'Stone',
    username: 'ava_stone',
    birthDate: '1997-04-12',
    occupation: 'Product Designer',
    gender: Gender.FEMALE,
    interestedIn: Gender.MALE,
    smoker: HabitFrequency.NEVER,
    alcohol: HabitFrequency.SOMETIMES,
    kids: KidsStatus.DOESNT_HAVE_KIDS,
    wantsKids: true,
    lookingFor: LookingFor.REAL_RELATIONSHIP,
    lastLocation: 'Dhaka',
    latitude: 23.8103,
    longitude: 90.4125,
    heightCm: 168,
    weightKg: 58,
    creativity: [CreativityInterest.ART, CreativityInterest.PHOTOGRAPHY],
    sports: [SportInterest.RUNNING, SportInterest.GYM],
    moviesAndDramas: [
      MovieAndDramaInterest.ROMANCE,
      MovieAndDramaInterest.K_DRAMA,
    ],
    images: [`${CDN}/ava-1.jpg`, `${CDN}/ava-2.jpg`],
    trustScore: 72,
  },
  {
    key: 'liam',
    phone: '+8801811000002',
    email: 'liam.chen@example.com',
    firstName: 'Liam',
    lastName: 'Chen',
    username: 'liam_chen',
    birthDate: '1995-09-30',
    occupation: 'Software Engineer',
    gender: Gender.MALE,
    interestedIn: Gender.FEMALE,
    smoker: HabitFrequency.NEVER,
    alcohol: HabitFrequency.SOMETIMES,
    kids: KidsStatus.DOESNT_HAVE_KIDS,
    wantsKids: true,
    lookingFor: LookingFor.REAL_RELATIONSHIP,
    lastLocation: 'Dhaka',
    latitude: 23.7806,
    longitude: 90.4193,
    heightCm: 180,
    weightKg: 76,
    creativity: [CreativityInterest.PHOTOGRAPHY],
    sports: [SportInterest.BASKETBALL, SportInterest.GYM],
    moviesAndDramas: [
      MovieAndDramaInterest.SCI_FI,
      MovieAndDramaInterest.THRILLER,
    ],
    images: [`${CDN}/liam-1.jpg`],
    trustScore: 81,
  },
  {
    key: 'noah',
    phone: '+8801811000003',
    email: 'noah.reed@example.com',
    firstName: 'Noah',
    lastName: 'Reed',
    username: 'noah_reed',
    birthDate: '1994-01-22',
    occupation: 'Architect',
    gender: Gender.MALE,
    interestedIn: Gender.FEMALE,
    smoker: HabitFrequency.SOMETIMES,
    alcohol: HabitFrequency.DAILY,
    kids: KidsStatus.DOESNT_HAVE_KIDS,
    wantsKids: false,
    lookingFor: LookingFor.SEE_WHERE_IT_GOES,
    lastLocation: 'Dhaka',
    latitude: 23.7925,
    longitude: 90.4078,
    heightCm: 176,
    weightKg: 72,
    creativity: [CreativityInterest.DESIGN, CreativityInterest.ART],
    sports: [SportInterest.TENNIS],
    moviesAndDramas: [
      MovieAndDramaInterest.COMEDY,
      MovieAndDramaInterest.ANIME,
    ],
    images: [`${CDN}/noah-1.jpg`],
    trustScore: 64,
  },
  {
    key: 'ethan',
    phone: '+8801811000004',
    email: 'ethan.hall@example.com',
    firstName: 'Ethan',
    lastName: 'Hall',
    username: 'ethan_hall',
    birthDate: '1996-06-05',
    occupation: 'Chef',
    gender: Gender.MALE,
    interestedIn: Gender.FEMALE,
    smoker: HabitFrequency.NEVER,
    alcohol: HabitFrequency.NEVER,
    kids: KidsStatus.HAS_KIDS,
    wantsKids: false,
    lookingFor: LookingFor.SOMETHING_MEANINGFUL,
    lastLocation: 'Dhaka',
    latitude: 23.8223,
    longitude: 90.3654,
    heightCm: 174,
    weightKg: 80,
    creativity: [CreativityInterest.SINGING],
    sports: [SportInterest.CRICKET, SportInterest.RUNNING],
    moviesAndDramas: [
      MovieAndDramaInterest.HORROR,
      MovieAndDramaInterest.ZOMBIE,
    ],
    images: [`${CDN}/ethan-1.jpg`],
    trustScore: 55,
  },
  {
    key: 'kabir',
    phone: '+8801811000005',
    email: 'kabir.rahman@example.com',
    firstName: 'Kabir',
    lastName: 'Rahman',
    username: 'kabir_rahman',
    birthDate: '1993-11-17',
    occupation: 'Doctor',
    gender: Gender.MALE,
    interestedIn: Gender.FEMALE,
    smoker: HabitFrequency.NEVER,
    alcohol: HabitFrequency.NEVER,
    kids: KidsStatus.PREFER_NOT_TO_SAY,
    wantsKids: true,
    lookingFor: LookingFor.REAL_RELATIONSHIP,
    lastLocation: 'Dhaka',
    latitude: 23.7465,
    longitude: 90.376,
    heightCm: 178,
    weightKg: 74,
    creativity: [CreativityInterest.MAKEUP],
    sports: [SportInterest.SOCCER],
    moviesAndDramas: [
      MovieAndDramaInterest.TV_SHOWS,
      MovieAndDramaInterest.FANTASY,
    ],
    images: [`${CDN}/kabir-1.jpg`],
    trustScore: 90,
  },
  {
    key: 'mia',
    phone: '+8801811000006',
    email: 'mia.khan@example.com',
    firstName: 'Mia',
    lastName: 'Khan',
    username: 'mia_khan',
    birthDate: '1998-02-08',
    occupation: 'Illustrator',
    gender: Gender.FEMALE,
    interestedIn: Gender.MALE,
    smoker: HabitFrequency.NEVER,
    alcohol: HabitFrequency.SOMETIMES,
    kids: KidsStatus.DOESNT_HAVE_KIDS,
    wantsKids: true,
    lookingFor: LookingFor.REAL_RELATIONSHIP,
    lastLocation: 'Dhaka',
    latitude: 23.8,
    longitude: 90.4,
    heightCm: 163,
    weightKg: 54,
    creativity: [CreativityInterest.ART, CreativityInterest.DESIGN],
    sports: [SportInterest.GYM],
    moviesAndDramas: [
      MovieAndDramaInterest.ROMANCE,
      MovieAndDramaInterest.K_DRAMA,
    ],
    images: [`${CDN}/mia-1.jpg`],
    trustScore: 77,
  },
  {
    key: 'zara',
    phone: '+8801811000007',
    email: 'zara.ali@example.com',
    firstName: 'Zara',
    lastName: 'Ali',
    username: 'zara_ali',
    birthDate: '1999-07-19',
    occupation: 'Marketer',
    gender: Gender.FEMALE,
    interestedIn: Gender.MALE,
    smoker: HabitFrequency.DAILY,
    alcohol: HabitFrequency.DAILY,
    kids: KidsStatus.DOESNT_HAVE_KIDS,
    wantsKids: false,
    lookingFor: LookingFor.SEE_WHERE_IT_GOES,
    lastLocation: 'Dhaka',
    latitude: 23.77,
    longitude: 90.42,
    heightCm: 166,
    weightKg: 57,
    creativity: [],
    sports: [],
    moviesAndDramas: [MovieAndDramaInterest.COMEDY],
    images: [`${CDN}/zara-1.jpg`],
    trustScore: 28,
  },
  {
    // Deliberately ~245 km from Dhaka, and MALE so he actually reaches Ava's
    // feed (her preferredGender filters it). At her default maxDistanceKm of
    // 50 he is filtered OUT; raise it past 250 via D-02 and he appears. That
    // makes the distance filter something you can watch working rather than
    // take on trust.
    key: 'rafiq',
    phone: '+8801811000009',
    email: 'rafiq.das@example.com',
    firstName: 'Rafiq',
    lastName: 'Das',
    username: 'rafiq_das',
    birthDate: '1996-03-05',
    occupation: 'Journalist',
    gender: Gender.MALE,
    interestedIn: Gender.FEMALE,
    smoker: HabitFrequency.NEVER,
    alcohol: HabitFrequency.NEVER,
    kids: KidsStatus.DOESNT_HAVE_KIDS,
    wantsKids: true,
    lookingFor: LookingFor.REAL_RELATIONSHIP,
    lastLocation: 'Sylhet',
    latitude: 24.8949,
    longitude: 91.8687,
    heightCm: 160,
    weightKg: 52,
    creativity: [CreativityInterest.PHOTOGRAPHY],
    sports: [SportInterest.RUNNING],
    moviesAndDramas: [MovieAndDramaInterest.THRILLER],
    images: [`${CDN}/rafiq-1.jpg`],
    trustScore: 68,
  },
];

export type UserMap = Record<string, string>;

export async function seedUsers(prisma: PrismaClient): Promise<UserMap> {
  console.log('👤 Seeding demo users...');
  const map: UserMap = {};
  let created = 0;
  let updated = 0;

  for (const u of SEED_USERS) {
    const data = {
      phone: u.phone,
      email: u.email,
      // Signed up by phone, so that is what is verified. The email is stored
      // but NOT verified — that is exactly the state the profile
      // contact-verification flow exists to resolve, and seeding it as
      // verified would hide the one path that can set it.
      isPhoneVerified: true,
      isEmailVerified: false,
      // Complete profile, so the account is visible in Discovery.
      isProfileComplete: true,
      // Admin-granted badge. Seeded true so the demo data shows a vouched
      // account; nothing in the user-facing API can set it.
      isUserVerified: true,
      selfieVerified: true,
      selfieUrl: u.images[0],
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      birthDate: new Date(u.birthDate),
      occupation: u.occupation,
      gender: u.gender,
      interestedIn: u.interestedIn,
      smoker: u.smoker,
      alcohol: u.alcohol,
      kids: u.kids,
      wantsKids: u.wantsKids,
      lookingFor: u.lookingFor,
      lastLocation: u.lastLocation,
      latitude: u.latitude,
      longitude: u.longitude,
      locationUpdatedAt: new Date(),
      locationPermission: LocationPermission.WHILE_IN_USE,
      heightCm: u.heightCm,
      weightKg: u.weightKg,
      creativity: u.creativity,
      sports: u.sports,
      moviesAndDramas: u.moviesAndDramas,
      notificationsEnabled: true,
      // Cleared so OTP cooldowns never carry over from a previous API run —
      // otherwise a fresh seed can still answer 429.
      lastOtpSentAt: null,
      lastContactOtpSentAt: null,
    };

    const existing = await prisma.user.findFirst({ where: { email: u.email } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data })
      : await prisma.user.create({ data });
    existing ? updated++ : created++;
    map[u.key] = user.id;

    // Images are replaced wholesale so re-seeding never stacks duplicates.
    await prisma.image.deleteMany({ where: { userId: user.id } });
    await prisma.image.createMany({
      data: u.images.map((url, i) => ({
        userId: user.id,
        r2Key: url,
        isPrimary: i === 0,
        sortOrder: i,
      })),
    });

    await prisma.discoveryPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        minAge: 22,
        maxAge: 40,
        maxDistanceKm: 50,
        preferredGender: u.interestedIn,
      },
      update: { preferredGender: u.interestedIn },
    });

    await prisma.trustScore.upsert({
      where: { userId: user.id },
      create: { userId: user.id, score: u.trustScore },
      update: { score: u.trustScore },
    });

    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.device.create({
      data: {
        userId: user.id,
        fcmToken: `demo-fcm-token-${u.key}`,
        platform: u.key === 'ava' ? Platform.IOS : Platform.ANDROID,
      },
    });
  }

  map.newcomer = await seedNewcomer(prisma);
  await pruneAbandonedAccounts(prisma);

  console.log(`  👤 ${created} created, ${updated} updated`);
  return map;
}

/**
 * Deletes half-finished accounts left behind by API runs.
 *
 * `POST /auth/login` creates an account for any unknown phone/email, so
 * exercising the collection with a throwaway identifier accumulates ghost
 * users. Only accounts that never completed onboarding are removed — no
 * username, no photos, not verified — so a real profile can never be caught
 * by this. The seeded accounts are excluded by identifier.
 */
async function pruneAbandonedAccounts(prisma: PrismaClient): Promise<void> {
  const { count } = await prisma.user.deleteMany({
    where: {
      username: null,
      isUserVerified: false,
      images: { none: {} },
      // `notIn` alone would skip these rows: in SQL, `phone NOT IN (...)` is
      // NULL — not true — when phone is NULL, and a ghost account has one of
      // the two identifiers unset by definition.
      AND: [
        {
          OR: [
            { phone: null },
            {
              phone: {
                notIn: [...SEED_USERS.map((u) => u.phone), NEWCOMER_PHONE],
              },
            },
          ],
        },
        {
          OR: [
            { email: null },
            { email: { notIn: SEED_USERS.map((u) => u.email) } },
          ],
        },
      ],
    },
  });
  if (count > 0) {
    console.log(`  🧹 removed ${count} abandoned account(s) from API runs`);
  }
}

/**
 * Creates (or resets) the onboarding test account: phone-verified, but with
 * every profile field blank so `isUserVerified` stays false.
 */
async function seedNewcomer(prisma: PrismaClient): Promise<string> {
  const blankProfile = {
    isPhoneVerified: true,
    isEmailVerified: false,
    isProfileComplete: false,
    isUserVerified: false,
    selfieVerified: false,
    selfieUrl: null,
    email: null,
    firstName: null,
    lastName: null,
    username: null,
    birthDate: null,
    occupation: null,
    gender: null,
    interestedIn: null,
    smoker: null,
    alcohol: null,
    kids: null,
    wantsKids: null,
    lookingFor: null,
    lastLocation: null,
    latitude: null,
    longitude: null,
    locationUpdatedAt: null,
    // The blank account has never seen the location prompt, which is the
    // state the "Set Your Location" screen expects on first run.
    locationPermission: LocationPermission.NOT_ASKED,
    heightCm: null,
    weightKg: null,
    creativity: [],
    sports: [],
    moviesAndDramas: [],
    notificationsEnabled: true,
    lastOtpSentAt: null,
    lastContactOtpSentAt: null,
  };

  const existing = await prisma.user.findFirst({
    where: { phone: NEWCOMER_PHONE },
  });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: blankProfile,
      })
    : await prisma.user.create({
        data: { phone: NEWCOMER_PHONE, ...blankProfile },
      });

  // Wipe anything a previous A-03 run left behind so the account is blank again.
  await prisma.image.deleteMany({ where: { userId: user.id } });
  await prisma.discoveryPreference.deleteMany({ where: { userId: user.id } });

  console.log(`  🆕 onboarding test account reset: ${NEWCOMER_PHONE}`);
  return user.id;
}
