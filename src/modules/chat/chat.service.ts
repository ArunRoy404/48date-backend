import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import { MessageType } from '../../generated/prisma/enums.js';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateConversation(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { matchId },
    });
    if (conversation) {
      return conversation;
    }

    return this.prisma.conversation.create({
      data: {
        matchId,
      },
    });
  }

  async getMessages(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { match: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (
      conversation.match.userLowId !== userId &&
      conversation.match.userHighId !== userId
    ) {
      throw new BadRequestException(
        'User is not a participant in this conversation',
      );
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            username: true,
            gender: true,
            images: {
              where: { isPrimary: true },
              select: { id: true, r2Key: true },
            },
          },
        },
        datePlan: true,
        gameSession: {
          include: {
            game: {
              include: {
                questions: {
                  orderBy: { order: 'asc' },
                },
              },
            },
            answers: true,
          },
        },
      },
    });
  }

  async saveTextMessage(
    conversationId: string,
    senderId: string,
    content: string,
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        type: MessageType.TEXT,
        content,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            images: {
              where: { isPrimary: true },
              select: { id: true, r2Key: true },
            },
          },
        },
      },
    });
  }

  async saveImageMessage(
    conversationId: string,
    senderId: string,
    mediaUrl: string,
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        type: MessageType.IMAGE,
        content: 'Sent an image',
        mediaUrl,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            images: {
              where: { isPrimary: true },
              select: { id: true, r2Key: true },
            },
          },
        },
      },
    });
  }

  async saveDateInviteMessage(
    conversationId: string,
    senderId: string,
    datePlanId: string,
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        type: MessageType.DATE_INVITE,
        content: 'Proposed a date plan',
        datePlanId,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            images: {
              where: { isPrimary: true },
              select: { id: true, r2Key: true },
            },
          },
        },
        datePlan: true,
      },
    });
  }

  async saveGameMessage(
    conversationId: string,
    senderId: string,
    gameSessionId: string,
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        type: MessageType.GAME,
        content: 'Started a game session',
        gameSessionId,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            images: {
              where: { isPrimary: true },
              select: { id: true, r2Key: true },
            },
          },
        },
        gameSession: {
          include: {
            game: {
              include: {
                questions: {
                  orderBy: { order: 'asc' },
                },
              },
            },
            answers: true,
          },
        },
      },
    });
  }

  /**
   * Retrieves all active conversations for a user.
   * Maps active matches and includes the matched user's profile and the last message.
   */
  async getConversations(userId: string) {
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
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const conversations = matches
      .filter((match) => match.conversation)
      .map((match) => {
        const targetUser =
          match.userLowId === userId ? match.userHigh : match.userLow;
        const conversation = match.conversation!;
        const lastMessage = conversation.messages[0] || null;

        return {
          id: conversation.id,
          matchId: match.id,
          matchedUser: formatUser(targetUser),
          lastMessage,
          updatedAt: conversation.updatedAt,
        };
      });

    // Sort by last message time or conversation update time
    return conversations.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }

  /**
   * Retrieves paginated messages for a specific conversation.
   * Verifies the user is a participant of the underlying match.
   */
  async getMessages(
    userId: string,
    conversationId: string,
    limit = 50,
    offset = 0,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { match: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const { match } = conversation;
    if (match.userLowId !== userId && match.userHighId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to access this conversation',
      );
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return messages.reverse();
  }

  /**
   * Persists a message to the database and updates conversation's last activity timestamp.
   */
  async saveMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          senderId,
          content,
          type,
        },
      });

      // Touch conversation to update its updatedAt timestamp
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return message;
    });
  }
}
