import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import { MatchesService } from '../matches/matches.service.js';
import { SwipeDto } from './dto/swipe.dto.js';
import { UpdatePreferencesDto } from './dto/update-preferences.dto.js';

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchesService: MatchesService,
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

    // Query other verified users
    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        isUserVerified: true,
        birthDate: {
          gte: minBirthDate,
          lte: maxBirthDate,
        },
        gender: prefs.preferredGender ? prefs.preferredGender : undefined,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
      },
      take: 50, // Get a pool of 50 candidates
    });

    // Shuffle profiles in memory for a random discover experience
    const shuffled = candidates.sort(() => Math.random() - 0.5);

    return shuffled.map((user) => formatUser(user));
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

    if (!user || !user.isUserVerified) {
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

    if (!targetUser || !targetUser.isUserVerified) {
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
      }
    }

    return { isMatch: false };
  }
}
