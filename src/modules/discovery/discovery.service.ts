import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  buildBoundingBox,
  haversineKm,
  roundDistanceKm,
} from '../../common/utils/geo.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import { MatchesService } from '../matches/matches.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SwipeDto } from './dto/swipe.dto.js';
import { UpdatePreferencesDto } from './dto/update-preferences.dto.js';

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchesService: MatchesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Lazy retrieves or creates default discovery preferences.
   */
  async getDiscoveryPreferences(userId: string) {
    let prefs = await this.prisma.discoveryPreference.findUnique({
      where: { userId },
    });
    if (!prefs) {
      prefs = await this.prisma.discoveryPreference.create({
        data: {
          userId,
          minAge: 18,
          maxAge: 60,
          maxDistanceKm: 50,
          preferredGender: null,
        },
      });
    }
    return prefs;
  }

  /**
   * Updates user's discovery preferences.
   */
  async updateDiscoveryPreferences(userId: string, dto: UpdatePreferencesDto) {
    // Lazy ensure exists first
    await this.getDiscoveryPreferences(userId);

    const updated = await this.prisma.discoveryPreference.update({
      where: { userId },
      data: {
        minAge: dto.minAge,
        maxAge: dto.maxAge,
        maxDistanceKm: dto.maxDistanceKm,
        preferredGender: dto.preferredGender,
      },
    });

    return updated;
  }

  /**
   * Fetches potential discovery candidates for the user.
   */
  async getDiscoveryProfiles(userId: string) {
    // Fetch preferences
    const prefs = await this.getDiscoveryPreferences(userId);

    // Get list of users the current user has already swiped on
    const swipedActions = await this.prisma.discoveryAction.findMany({
      where: { actorId: userId },
      select: { targetUserId: true },
    });
    const swipedUserIds = swipedActions.map((action) => action.targetUserId);

    // Get list of mutual blocks
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedUserId: userId }],
      },
      select: {
        blockerId: true,
        blockedUserId: true,
      },
    });
    const blockedUserIds = new Set<string>();
    for (const b of blocks) {
      blockedUserIds.add(b.blockerId);
      blockedUserIds.add(b.blockedUserId);
    }

    // Exclude swiped users, blocked users, and the user themselves
    const excludeIds = Array.from(
      new Set([userId, ...swipedUserIds, ...blockedUserIds]),
    );

    // Age bounds calculations
    const now = new Date();
    const minBirthDate = new Date(
      now.getFullYear() - prefs.maxAge - 1,
      now.getMonth(),
      now.getDate(),
    );
    const maxBirthDate = new Date(
      now.getFullYear() - prefs.minAge,
      now.getMonth(),
      now.getDate(),
    );

    // Distance filtering only happens when we know where the viewer is. A user
    // who refused the location prompt still gets a feed — just an unfiltered
    // one — rather than an empty screen they cannot explain.
    const viewer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { latitude: true, longitude: true },
    });
    // Pulled into consts so the null-check narrows them for the closures below.
    const viewerLat = viewer?.latitude ?? null;
    const viewerLon = viewer?.longitude ?? null;
    const canFilterByDistance = viewerLat !== null && viewerLon !== null;

    let locationWhere: Prisma.UserWhereInput = {};
    if (canFilterByDistance) {
      const box = buildBoundingBox(viewerLat, viewerLon, prefs.maxDistanceKm);
      const latitudeRange = {
        gte: box.minLatitude,
        lte: box.maxLatitude,
      };

      locationWhere = box.wrapsAntimeridian
        ? {
            // The box straddles ±180°, so it is two ranges, not one.
            latitude: latitudeRange,
            OR: [
              { longitude: { gte: box.minLongitude } },
              { longitude: { lte: box.maxLongitude } },
            ],
          }
        : {
            latitude: latitudeRange,
            longitude: { gte: box.minLongitude, lte: box.maxLongitude },
          };
    }

    // Query other verified users
    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        isProfileComplete: true,
        birthDate: {
          gte: minBirthDate,
          lte: maxBirthDate,
        },
        gender: prefs.preferredGender ? prefs.preferredGender : undefined,
        ...locationWhere,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
      },
      // Over-fetch while distance filtering: the bounding box admits corners
      // that are further away than maxDistanceKm, and those get dropped below.
      take: canFilterByDistance ? 200 : 50,
    });

    // The bounding box is a coarse prefilter — this is the exact test.
    const withDistance = candidates.map((user) => ({
      user,
      distanceKm:
        canFilterByDistance && user.latitude != null && user.longitude != null
          ? haversineKm(viewerLat, viewerLon, user.latitude, user.longitude)
          : null,
    }));

    const inRange = canFilterByDistance
      ? withDistance.filter(
          (c) => c.distanceKm !== null && c.distanceKm <= prefs.maxDistanceKm,
        )
      : withDistance;

    // Shuffle profiles in memory for a random discover experience
    const shuffled = inRange.sort(() => Math.random() - 0.5).slice(0, 50);

    return shuffled.map(({ user, distanceKm }) =>
      formatUser(user, {
        distanceKm: distanceKm === null ? null : roundDistanceKm(distanceKm),
      }),
    );
  }

  /**
   * Fetches profile details of a single discovery user.
   */
  async getProfileDetail(userId: string, targetId: string) {
    // Check blocks
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedUserId: targetId },
          { blockerId: targetId, blockedUserId: userId },
        ],
      },
    });

    if (block) {
      throw new NotFoundException('Profile not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!user || !user.isProfileComplete) {
      throw new NotFoundException('Profile not found');
    }

    return formatUser(user);
  }

  /**
   * Performs a swipe/action on a user.
   */
  async swipe(userId: string, dto: SwipeDto) {
    const { targetUserId, action } = dto;

    if (userId === targetUserId) {
      throw new BadRequestException('You cannot swipe on yourself');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser || !targetUser.isProfileComplete) {
      throw new NotFoundException('Target profile not found');
    }

    // Upsert action
    await this.prisma.discoveryAction.upsert({
      where: {
        actorId_targetUserId: {
          actorId: userId,
          targetUserId,
        },
      },
      create: {
        actorId: userId,
        targetUserId,
        action,
      },
      update: {
        action,
      },
    });

    // Check for mutual like
    if (action === 'LIKE' || action === 'SUPER_LIKE') {
      const counterAction = await this.prisma.discoveryAction.findUnique({
        where: {
          actorId_targetUserId: {
            actorId: targetUserId,
            targetUserId: userId,
          },
        },
      });

      if (
        counterAction &&
        (counterAction.action === 'LIKE' ||
          counterAction.action === 'SUPER_LIKE')
      ) {
        // It's a match!
        const { match, conversation } = await this.matchesService.createMatch(
          userId,
          targetUserId,
        );

        // Queue mutual match notifications in background
        await this.notificationsService.queueMatchNotification(
          userId,
          targetUserId,
        );

        const fullTargetUser = await this.prisma.user.findUnique({
          where: { id: targetUserId },
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        });

        return {
          isMatch: true,
          match: {
            id: match.id,
            conversationId: conversation!.id,
            matchedUser: formatUser(fullTargetUser!),
          },
        };
      } else if (action === 'SUPER_LIKE') {
        // Queue super like notification if not matched
        await this.notificationsService.queueSuperLikeNotification(
          userId,
          targetUserId,
        );
      }
    }

    return { isMatch: false };
  }
}
