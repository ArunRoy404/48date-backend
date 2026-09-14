import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import type { GetBlocksQueryDto } from './dto/get-blocks-query.dto.js';
import type { FormattedBlock } from './types/blocks.types.js';

@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /blocks/:userId
   * Blocks a target user. Also terminates any existing active match between them.
   */
  async blockUser(blockerId: string, blockedUserId: string) {
    if (blockerId === blockedUserId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: blockedUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('User to block not found');
    }

    const [lowId, highId] =
      blockerId < blockedUserId
        ? [blockerId, blockedUserId]
        : [blockedUserId, blockerId];

    await this.prisma.$transaction(async (tx) => {
      // 1. Create or ensure block record
      await tx.block.upsert({
        where: {
          blockerId_blockedUserId: {
            blockerId,
            blockedUserId,
          },
        },
        update: {},
        create: {
          blockerId,
          blockedUserId,
        },
      });

      // 2. Terminate any active match between both users
      const match = await tx.match.findUnique({
        where: {
          userLowId_userHighId: {
            userLowId: lowId,
            userHighId: highId,
          },
        },
      });

      if (match && match.status === 'ACTIVE') {
        await tx.match.update({
          where: { id: match.id },
          data: {
            status: 'UNMATCHED',
            unmatchedAt: new Date(),
          },
        });
      }
    });

    this.logger.log(`User ${blockerId} blocked user ${blockedUserId}`);

    return {
      message: 'User blocked successfully',
      blockedUserId,
    };
  }

  /**
   * GET /blocks
   * Retrieves the list of users blocked by the caller.
   */
  async getBlockedUsers(
    blockerId: string,
    query: GetBlocksQueryDto,
  ): Promise<FormattedBlock[]> {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId },
      include: {
        blockedUser: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });

    return blocks.map((b) => ({
      id: b.id,
      blockerId: b.blockerId,
      blockedUserId: b.blockedUserId,
      blockedUser: formatUser(b.blockedUser),
      createdAt: b.createdAt,
    }));
  }

  /**
   * DELETE /blocks/:userId
   * Unblocks a target user.
   */
  async unblockUser(blockerId: string, blockedUserId: string) {
    const existingBlock = await this.prisma.block.findUnique({
      where: {
        blockerId_blockedUserId: {
          blockerId,
          blockedUserId,
        },
      },
    });

    if (!existingBlock) {
      throw new NotFoundException('Block record not found');
    }

    await this.prisma.block.delete({
      where: { id: existingBlock.id },
    });

    this.logger.log(`User ${blockerId} unblocked user ${blockedUserId}`);

    return {
      message: 'User unblocked successfully',
      unblockedUserId: blockedUserId,
    };
  }
}
