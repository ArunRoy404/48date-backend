<<<<<<< HEAD
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service.js';
import { MatchesService } from '../matches/matches.service.js';
import { DatesService } from '../dates/dates.service.js';
import { GamesService } from '../games/games.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly matchesService: MatchesService,
    private readonly datesService: DatesService,
    private readonly gamesService: GamesService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const handshake = client.handshake;
      const headers = handshake.headers as Record<string, string | undefined>;
      const auth = handshake.auth as
        Record<string, string | undefined> | undefined;
      const authHeader = headers.authorization || auth?.token;

      if (!authHeader) {
        this.logger.warn('Connection attempt failed: No Authorization token');
        client.disconnect();
        return;
      }

      const token = authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader;

      const decoded: unknown = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
      const payload = decoded as { sub: string; role: string };

      (client.data as Record<string, unknown>).user = {
        userId: payload.sub,
        role: payload.role,
      };
      const userId = payload.sub;

      await client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Connection auth error: ${msg}`);
=======
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
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
      client.disconnect();
    }
  }

<<<<<<< HEAD
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = (client.data as Record<string, any>)?.user as
      { userId: string } | undefined;
    const userId = user?.userId;
    if (!userId) return;

    const conversationId = data.conversationId;

=======
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
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { match: true },
    });

    if (!conversation) {
<<<<<<< HEAD
      client.emit('error', { message: 'Conversation not found' });
      return;
    }

    if (
      conversation.match.userLowId !== userId &&
      conversation.match.userHighId !== userId
    ) {
      client.emit('error', { message: 'Access denied' });
      return;
    }

    await client.join(`conversation:${conversationId}`);
    client.emit('joined_conversation', { conversationId });
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; content: string; mediaUrl?: string },
  ) {
    const user = (client.data as Record<string, any>)?.user as
      { userId: string } | undefined;
    const userId = user?.userId;
    if (!userId) return;

    const conversationId = data.conversationId;
    const content = data.content;
    const mediaUrl = data.mediaUrl;

    let message;
    if (mediaUrl) {
      message = await this.chatService.saveImageMessage(
        conversationId,
        userId,
        mediaUrl,
      );
    } else {
      message = await this.chatService.saveTextMessage(
        conversationId,
        userId,
=======
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
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
        content,
      );
    }

<<<<<<< HEAD
    this.server
      .to(`conversation:${conversationId}`)
      .emit('new_message', message);
  }

  @SubscribeMessage('propose_date')
  async handleProposeDate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      venueName: string;
      venueAddress: string;
      latitude?: number;
      longitude?: number;
      mapboxPlaceId?: string;
      date: string;
      startTime: string;
      endTime?: string;
    },
  ) {
    const user = (client.data as Record<string, any>)?.user as
      { userId: string } | undefined;
    const userId = user?.userId;
    if (!userId) return;

    const conversationId = data.conversationId;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      client.emit('error', { message: 'Conversation not found' });
      return;
    }

    const datePlan = await this.datesService.createDatePlan(
      conversation.matchId,
      userId,
      {
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        latitude: data.latitude,
        longitude: data.longitude,
        mapboxPlaceId: data.mapboxPlaceId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
      },
    );

    const message = await this.chatService.saveDateInviteMessage(
      conversationId,
      userId,
      datePlan.id,
    );

    this.server
      .to(`conversation:${conversationId}`)
      .emit('new_message', message);
  }

  @SubscribeMessage('respond_to_date')
  async handleRespondToDate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; datePlanId: string; accept: boolean },
  ) {
    const user = (client.data as Record<string, any>)?.user as
      { userId: string } | undefined;
    const userId = user?.userId;
    if (!userId) return;

    const conversationId = data.conversationId;
    const datePlanId = data.datePlanId;
    const accept = Boolean(data.accept);

    const updatedDatePlan = await this.datesService.respondToDatePlan(
      datePlanId,
      userId,
      accept,
    );

    this.server
      .to(`conversation:${conversationId}`)
      .emit('date_plan_updated', updatedDatePlan);
  }

  @SubscribeMessage('start_game')
  async handleStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; gameId: string },
  ) {
    const user = (client.data as Record<string, any>)?.user as
      { userId: string } | undefined;
    const userId = user?.userId;
    if (!userId) return;

    const conversationId = data.conversationId;
    const gameId = data.gameId;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      client.emit('error', { message: 'Conversation not found' });
      return;
    }

    const gameSession = await this.gamesService.startGameSession(
      conversation.matchId,
      gameId,
      userId,
    );

    const message = await this.chatService.saveGameMessage(
      conversationId,
      userId,
      gameSession.id,
    );

    this.server
      .to(`conversation:${conversationId}`)
      .emit('new_message', message);
  }

  @SubscribeMessage('submit_game_answer')
  async handleSubmitGameAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      gameSessionId: string;
      questionId: string;
      selectedOption: string;
    },
  ) {
    const user = (client.data as Record<string, any>)?.user as
      { userId: string } | undefined;
    const userId = user?.userId;
    if (!userId) return;

    const conversationId = data.conversationId;
    const gameSessionId = data.gameSessionId;
    const questionId = data.questionId;
    const selectedOption = data.selectedOption;

    const updatedSession = await this.gamesService.submitAnswer(
      gameSessionId,
      userId,
      questionId,
      selectedOption,
    );

    this.server
      .to(`conversation:${conversationId}`)
      .emit('game_session_updated', updatedSession);
=======
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
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
  }
}
