import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import type { Conversation, Match } from '../../generated/prisma/client.js';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Internal method to create a mutual Match and associated Conversation.
   * Ensures userLowId is the lexicographically smaller UUID.
   *
   * Returns `created: false` when an already-ACTIVE match is returned as-is.
   * Callers use the flag to avoid announcing a match twice — re-likes on an
   * existing match and the loser of a concurrent-swipe race both land here.
   */
  async createMatch(
    userAId: string,
    userBId: string,
  ): Promise<{
    match: Match;
    conversation: Conversation | null;
    created: boolean;
  }> {
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
        // Reactivate match and recreate conversation
        return this.prisma.$transaction(async (tx) => {
          const updatedMatch = await tx.match.update({
            where: { id: existing.id },
            data: {
              status: 'ACTIVE',
              matchedAt: new Date(),
              unmatchedAt: null,
            },
          });

          // Create conversation if it doesn't exist
          let conversation = await tx.conversation.findUnique({
            where: { matchId: updatedMatch.id },
          });
          if (!conversation) {
            conversation = await tx.conversation.create({
              data: { matchId: updatedMatch.id },
            });
          }

          return { match: updatedMatch, conversation, created: true };
        });
      }
      // If already active, just retrieve the conversation — nothing new
      // happened, so the caller must not re-announce the match.
      const conversation = await this.prisma.conversation.findUnique({
        where: { matchId: existing.id },
      });
      return { match: existing, conversation, created: false };
    }

    // Create match and conversation in transaction. Two concurrent mutual
    // swipes can both reach this point; the (userLowId, userHighId) unique
    // constraint lets exactly one transaction win, and the loser recovers by
    // returning the winner's row instead of surfacing a raw P2002 as a 500.
    try {
      return await this.prisma.$transaction(async (tx) => {
        const match = await tx.match.create({
          data: {
            userLowId: lowId,
            userHighId: highId,
            status: 'ACTIVE',
          },
        });

        const conversation = await tx.conversation.create({
          data: {
            matchId: match.id,
          },
        });

        return { match, conversation, created: true };
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const winner = await this.prisma.match.findUnique({
        where: {
          userLowId_userHighId: {
            userLowId: lowId,
            userHighId: highId,
          },
        },
      });
      if (!winner) {
        throw error;
      }

      let conversation = await this.prisma.conversation.findUnique({
        where: { matchId: winner.id },
      });
      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: { matchId: winner.id },
        });
      }

      return { match: winner, conversation, created: false };
    }
  }

  /** Prisma P2002 (unique constraint) detector — see createMatch's race path. */
  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  /**
   * Fetches all active matches for a user, including the matched user's profile details.
   */
  async getActiveMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ userLowId: userId }, { userHighId: userId }],
      },
      include: {
        userLow: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        userHigh: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        conversation: true,
      },
      orderBy: {
        matchedAt: 'desc',
      },
    });

    return matches.map((match) => {
      const targetUser =
        match.userLowId === userId ? match.userHigh : match.userLow;
      return {
        matchId: match.id,
        conversationId: match.conversation?.id || null,
        matchedUser: formatUser(targetUser),
        matchedAt: match.matchedAt,
        status: match.status,
      };
    });
  }

  /**
   * Sets a match status to UNMATCHED.
   */
  async unmatch(userId: string, matchId: string) {
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
