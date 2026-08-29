/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { env } from '../../config/env.config.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ChatService } from './chat.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MessageType } from '../../generated/prisma/enums.js';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  private activeSockets = new Map<string, string[]>();
  private redisClient: any = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.initializeRedis();
  }

  private initializeRedis() {
    if (env.REDIS_URL) {
      try {
        this.redisClient = new Redis(env.REDIS_URL);
        this.redisClient.on('error', (err) => {
          this.logger.error(`Redis socket presence error: ${err.message}`);
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to connect to Redis socket presence: ${err?.message}`,
        );
      }
    }
  }

  /**
   * Handshake connection authentication with JWT verification.
   */
  async handleConnection(client: Socket) {
    const authHeader = client.handshake.headers.authorization;
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      token = client.handshake.query?.token as string;
    }

    if (!token) {
      this.logger.warn(
        `Connection rejected: No token provided (socket ID: ${client.id})`,
      );
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: env.JWT_ACCESS_SECRET,
      });

      const userId = payload.sub || payload.userId;
      client.data.userId = userId;

      // Track active sockets
      const socketIds = this.activeSockets.get(userId) || [];
      socketIds.push(client.id);
      this.activeSockets.set(userId, socketIds);

      // Track globally in Redis
      if (this.redisClient) {
        await this.redisClient
          .hset('online_users', userId, 'true')
          .catch(() => {});
      }

      this.logger.log(`Client authenticated: ${client.id} (user: ${userId})`);
    } catch (err: any) {
      this.logger.error(
        `Connection auth failed for client ${client.id}: ${err?.message}`,
      );
      client.disconnect();
    }
  }

  /**
   * Handle socket client disconnect and cleanup presence trackers.
   */
  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      const socketIds = this.activeSockets.get(userId) || [];
      const updatedSockets = socketIds.filter((id) => id !== client.id);

      if (updatedSockets.length > 0) {
        this.activeSockets.set(userId, updatedSockets);
      } else {
        this.activeSockets.delete(userId);
        if (this.redisClient) {
          await this.redisClient.hdel('online_users', userId).catch(() => {});
        }
      }
      this.logger.log(`Client disconnected: ${client.id} (user: ${userId})`);
    }
  }

  /**
   * Event: joinRoom
   * Client requests to join a conversation room.
   */
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(client: Socket, payload: { conversationId: string }) {
    const { conversationId } = payload;
    const userId = client.data.userId;

    if (!userId || !conversationId) {
      return { error: 'Invalid joinRoom request' };
    }

    // Verify room authorization
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { match: true },
    });

    if (!conversation) {
      return { error: 'Conversation not found' };
    }

    const { match } = conversation;
    if (match.userLowId !== userId && match.userHighId !== userId) {
      return { error: 'You are not a participant in this conversation' };
    }

    await client.join(conversationId);
    this.logger.log(`User ${userId} joined room ${conversationId}`);
    return { success: true };
  }

  /**
   * Event: sendMessage
   * Client sends a message to the room.
   */
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    client: Socket,
    payload: { conversationId: string; content: string; type?: MessageType },
  ) {
    const { conversationId, content, type } = payload;
    const userId = client.data.userId;

    if (!userId || !conversationId || !content) {
      return { error: 'Invalid message request' };
    }

    // Verify membership
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { match: true },
    });

    if (!conversation) {
      return { error: 'Conversation not found' };
    }

    const { match } = conversation;
    if (match.userLowId !== userId && match.userHighId !== userId) {
      return { error: 'Unauthorized to send message to this conversation' };
    }

    // Save message
    const msgType = type || MessageType.TEXT;
    const savedMessage = await this.chatService.saveMessage(
      conversationId,
      userId,
      content,
      msgType,
    );

    // Broadcast to room (both users receive it)
    this.server.to(conversationId).emit('newMessage', savedMessage);

    // Alert recipient if not currently online/connected to gateway
    const partnerId =
      match.userLowId === userId ? match.userHighId : match.userLowId;
    const isPartnerOnline = this.activeSockets.has(partnerId);

    if (!isPartnerOnline) {
      await this.notificationsService.queueMessageNotification(
        userId,
        partnerId,
        content,
      );
    }

    return { success: true, messageId: savedMessage.id };
  }

  /**
   * Event: typing
   * Client sends typing indicator status.
   */
  @SubscribeMessage('typing')
  handleTyping(
    client: Socket,
    payload: { conversationId: string; isTyping: boolean },
  ) {
    const { conversationId, isTyping } = payload;
    const userId = client.data.userId;

    if (!userId || !conversationId) return;

    // Send only to the other participant in the room
    client.to(conversationId).emit('typing', { userId, isTyping });
  }

  /**
   * Expose helper to broadcast custom events to a match's conversation room.
   * Useful for other modules (like Games) to push real-time UI states.
   */
  async emitToMatch(matchId: string, event: string, data: any) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { matchId },
    });
    if (conversation) {
      this.server.to(conversation.id).emit(event, data);
      this.logger.log(`Emitted event "${event}" to room: ${conversation.id}`);
    } else {
      this.logger.warn(
        `Cannot emit event "${event}"; Conversation for match ID ${matchId} not found.`,
      );
    }
  }
}
