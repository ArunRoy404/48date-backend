import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MessageType } from '../../generated/prisma/client.js';

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

  async getUserConversations(userId: string) {
    // Find all matches for this user
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ userLowId: userId }, { userHighId: userId }],
      },
      include: {
        userLow: {
          select: {
            id: true,
            name: true,
            images: { where: { isPrimary: true }, select: { r2Key: true } },
          },
        },
        userHigh: {
          select: {
            id: true,
            name: true,
            images: { where: { isPrimary: true }, select: { r2Key: true } },
          },
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
    });

    return matches.map((m) => {
      const partner = m.userLowId === userId ? m.userHigh : m.userLow;
      return {
        matchId: m.id,
        partner: {
          id: partner.id,
          name: partner.name,
          avatarUrl: partner.images[0]?.r2Key ?? null,
        },
        conversationId: m.conversation?.id ?? null,
        lastMessage: m.conversation?.messages[0] ?? null,
      };
    });
  }
}
