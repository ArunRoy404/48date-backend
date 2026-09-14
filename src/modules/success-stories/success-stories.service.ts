/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import { StoryStatus } from '../../generated/prisma/enums.js';
import type { CreateSuccessStoryDto } from './dto/create-success-story.dto.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';
import type { GetSuccessStoriesQueryDto } from './dto/get-success-stories-query.dto.js';
import type {
  FormattedSuccessStory,
  FormattedComment,
} from './types/success-stories.types.js';

@Injectable()
export class SuccessStoriesService {
  private readonly logger = new Logger(SuccessStoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to format a raw SuccessStory record
   */
  private formatStory(
    rawStory: any,
    currentUserId?: string,
  ): FormattedSuccessStory {
    const isLikedByMe = currentUserId
      ? (rawStory.likes?.some((l: any) => l.userId === currentUserId) ?? false)
      : false;

    const likeCount = rawStory._count?.likes ?? rawStory.likes?.length ?? 0;
    const commentCount =
      rawStory._count?.comments ??
      rawStory.comments?.filter((c: any) => !c.deletedAt)?.length ??
      0;

    const comments: FormattedComment[] | undefined = rawStory.comments
      ? rawStory.comments
          .filter((c: any) => !c.deletedAt)
          .map((c: any) => ({
            id: c.id,
            storyId: c.storyId,
            userId: c.userId,
            user: formatUser(c.user),
            content: c.content,
            createdAt: c.createdAt,
          }))
      : undefined;

    return {
      id: rawStory.id,
      title: rawStory.title,
      story: rawStory.story,
      images: rawStory.images ?? [],
      status: rawStory.status,
      authorId: rawStory.authorId,
      partnerId: rawStory.partnerId,
      matchId: rawStory.matchId ?? null,
      author: formatUser(rawStory.author),
      partner: formatUser(rawStory.partner),
      likeCount,
      commentCount,
      isLikedByMe,
      comments,
      createdAt: rawStory.createdAt,
      updatedAt: rawStory.updatedAt,
    };
  }

  /**
   * POST /success-stories
   * Creates a success story for a dating couple (initial status PENDING for admin approval).
   */
  async createStory(
    authorId: string,
    dto: CreateSuccessStoryDto,
  ): Promise<FormattedSuccessStory> {
    if (authorId === dto.partnerId) {
      throw new BadRequestException('Partner cannot be yourself');
    }

    const partner = await this.prisma.user.findUnique({
      where: { id: dto.partnerId },
    });

    if (!partner) {
      throw new NotFoundException('Partner user not found');
    }

    if (dto.matchId) {
      const match = await this.prisma.match.findUnique({
        where: { id: dto.matchId },
      });

      if (!match) {
        throw new NotFoundException('Match record not found');
      }

      const isParticipant =
        (match.userLowId === authorId && match.userHighId === dto.partnerId) ||
        (match.userLowId === dto.partnerId && match.userHighId === authorId);

      if (!isParticipant) {
        throw new BadRequestException(
          'Specified match does not correspond to you and your partner',
        );
      }
    }

    const createdStory = await this.prisma.successStory.create({
      data: {
        authorId,
        partnerId: dto.partnerId,
        matchId: dto.matchId ?? null,
        title: dto.title,
        story: dto.story,
        images: dto.images ?? [],
        status: StoryStatus.PENDING,
      },
      include: {
        author: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        partner: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    this.logger.log(
      `Success story created by ${authorId} with partner ${dto.partnerId}`,
    );

    return this.formatStory(createdStory, authorId);
  }

  /**
   * GET /success-stories
   * Lists published success stories with like and comment counts.
   */
  async getStories(
    currentUserId?: string,
    query?: GetSuccessStoriesQueryDto,
  ): Promise<FormattedSuccessStory[]> {
    const status = query?.status ?? StoryStatus.PUBLISHED;

    const stories = await this.prisma.successStory.findMany({
      where: { status },
      include: {
        author: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        partner: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        likes: currentUserId ? { where: { userId: currentUserId } } : false,
        _count: {
          select: {
            likes: true,
            comments: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query?.limit ?? 20,
      skip: query?.offset ?? 0,
    });

    return stories.map((s) => this.formatStory(s, currentUserId));
  }

  /**
   * GET /success-stories/:id
   * Retrieves single story details including full comments.
   */
  async getStoryById(
    storyId: string,
    currentUserId?: string,
  ): Promise<FormattedSuccessStory> {
    const story = await this.prisma.successStory.findUnique({
      where: { id: storyId },
      include: {
        author: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        partner: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        likes: currentUserId ? { where: { userId: currentUserId } } : false,
        comments: {
          where: { deletedAt: null },
          include: {
            user: {
              include: { images: { orderBy: { sortOrder: 'asc' } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            likes: true,
            comments: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!story) {
      throw new NotFoundException('Success story not found');
    }

    // Only allow viewing non-published stories if caller is author or partner
    if (story.status !== StoryStatus.PUBLISHED) {
      const isOwner =
        currentUserId &&
        (story.authorId === currentUserId || story.partnerId === currentUserId);
      if (!isOwner) {
        throw new NotFoundException('Success story not found');
      }
    }

    return this.formatStory(story, currentUserId);
  }

  /**
   * POST /success-stories/:id/like
   * Toggles like/unlike on a published story.
   */
  async toggleLike(storyId: string, userId: string) {
    const story = await this.prisma.successStory.findUnique({
      where: { id: storyId },
    });

    if (!story || story.status !== StoryStatus.PUBLISHED) {
      throw new NotFoundException('Published success story not found');
    }

    const existingLike = await this.prisma.successStoryLike.findUnique({
      where: {
        storyId_userId: {
          storyId,
          userId,
        },
      },
    });

    let isLiked = false;

    if (existingLike) {
      await this.prisma.successStoryLike.delete({
        where: {
          storyId_userId: {
            storyId,
            userId,
          },
        },
      });
      isLiked = false;
    } else {
      await this.prisma.successStoryLike.create({
        data: {
          storyId,
          userId,
        },
      });
      isLiked = true;
    }

    const likeCount = await this.prisma.successStoryLike.count({
      where: { storyId },
    });

    return {
      isLiked,
      likeCount,
    };
  }

  /**
   * POST /success-stories/:id/comments
   * Adds a comment to a published story.
   */
  async addComment(
    storyId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<FormattedComment> {
    const story = await this.prisma.successStory.findUnique({
      where: { id: storyId },
    });

    if (!story || story.status !== StoryStatus.PUBLISHED) {
      throw new NotFoundException('Published success story not found');
    }

    const comment = await this.prisma.successStoryComment.create({
      data: {
        storyId,
        userId,
        content: dto.content,
      },
      include: {
        user: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    return {
      id: comment.id,
      storyId: comment.storyId,
      userId: comment.userId,
      user: formatUser(comment.user),
      content: comment.content,
      createdAt: comment.createdAt,
    };
  }

  /**
   * DELETE /success-stories/:id/comments/:commentId
   * Deletes a comment (caller must be the comment author or story author).
   */
  async deleteComment(storyId: string, commentId: string, userId: string) {
    const comment = await this.prisma.successStoryComment.findUnique({
      where: { id: commentId },
      include: { story: true },
    });

    if (!comment || comment.storyId !== storyId || comment.deletedAt !== null) {
      throw new NotFoundException('Comment not found');
    }

    const isAuthorized =
      comment.userId === userId || comment.story.authorId === userId;

    if (!isAuthorized) {
      throw new ForbiddenException(
        'You are not authorized to delete this comment',
      );
    }

    await this.prisma.successStoryComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    return {
      message: 'Comment deleted successfully',
    };
  }
}
