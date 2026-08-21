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
      client.disconnect();
    }
  }

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

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { match: true },
    });

    if (!conversation) {
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
        content,
      );
    }

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
  }
}
