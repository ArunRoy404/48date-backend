import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MatchStatus } from '../../generated/prisma/client.js';
import { formatUser } from '../../common/utils/user-formatter.js';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async validateMatch(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    if (match.userLowId !== userId && match.userHighId !== userId) {
      throw new BadRequestException('User is not a participant in this match');
    }
    if (match.status !== MatchStatus.ACTIVE) {
      throw new BadRequestException('This match is no longer active');
    }
    return match;
  }

  /**
   * Internal method to create a mutual Match and associated Conversation.
   * Ensures userLowId is the lexicographically smaller UUID.
   */
  async createMatch(userAId: string, userBId: string) {
    const [lowId, highId] =
      userAId < userBId ? [userAId, userBId] : [userBId, userAId];

    // Check if match already exists
    const existing = await this.prisma.match.findUnique({
      where: {
        userLowId_userHighId: {
          userLowId: lowId,
          userHighId: highId,
        },
      },
    });

    if (existing) {
      if (existing.status === 'UNMATCHED') {
        // Re-activate match
        return this.prisma.match.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', unmatchedAt: null },
        });
      }
      return existing;
    }

    // Create match and conversation atomically
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          userLowId: lowId,
          userHighId: highId,
          status: 'ACTIVE',
        },
      });

      await tx.conversation.create({
        data: {
          matchId: match.id,
        },
      });

      return match;
    });
  }

  /**
   * Retrieves all active matches for the specified user, including participant profile details.
   */
  async getUserMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ userLowId: userId }, { userHighId: userId }],
      },
      include: {
        userLow: {
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
          },
        },
        userHigh: {
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match) => {
      const isLow = match.userLowId === userId;
      const partner = isLow ? match.userHigh : match.userLow;

      return {
        matchId: match.id,
        matchedAt: match.createdAt,
        user: formatUser(partner),
      };
    });
  }

  /**
   * Unmatches a user by setting match status to UNMATCHED.
   */
  async unmatchUser(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.userLowId !== userId && match.userHighId !== userId) {
      throw new NotFoundException('Match not found'); // Prevent resource enumeration
    }

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'UNMATCHED',
        unmatchedAt: new Date(),
      },
    });

    return { message: 'Unmatched successfully' };
  }
}
