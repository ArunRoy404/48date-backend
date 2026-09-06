/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { env } from '../../config/env.config.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ChatService } from './chat.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private redisClient!: Redis;
  private readonly activeSockets = new Map<string, string[]>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly notificationsService: NotificationsService,
  ) {
    try {
      this.redisClient = new Redis(env.REDIS_URL, {
        lazyConnect: true,
      });
      this.redisClient.connect().catch((err: unknown) => {
        this.logger.error('Redis connection error in ChatGateway:', err);
      });
    } catch (err) {
      this.logger.error('Failed to initialize Redis in ChatGateway:', err);
    }
  }

  /**
   * Handle incoming connection and authenticate via Bearer token in handshake auth or headers.
   */
  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Connection denied: Missing token (${client.id})`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        token,
        { secret: env.JWT_ACCESS_SECRET },
      );

      const userId = payload.sub;
      client.data.userId = userId;

      const existing = this.activeSockets.get(userId) || [];
      this.activeSockets.set(userId, [...existing, client.id]);

      if (this.redisClient) {
        await this.redisClient
          .hset('online_users', userId, Date.now().toString())
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
