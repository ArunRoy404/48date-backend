import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ChatService } from './chat.service.js';
import { ChatGateway } from './chat.gateway.js';
import { CreateMessageDto } from './dto/send-message.dto.js';
import { successResponse } from '../../common/response/api-response.util.js';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * GET /chat/conversations
   * Retrieves active conversations/rooms for the authenticated user.
   */
  @Get('conversations')
  async getConversations(@Req() req: Request) {
    const userId = req.user!.userId;
    const data = await this.chatService.getConversations(userId);
    return successResponse(data, 'Conversations retrieved successfully');
  }

  /**
   * GET /chat/conversations/:id/messages
   * Retrieves paginated message history for a specific conversation.
   */
  @Get('conversations/:id/messages')
  async getMessages(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const userId = req.user!.userId;
    const data = await this.chatService.getMessages(
      userId,
      conversationId,
      limit,
      offset,
    );
    return successResponse(data, 'Message history retrieved successfully');
  }

  /**
   * POST /chat/conversations/:id/messages
   * Sends a message (text and/or image) to a conversation via REST.
   * Also broadcasts live over Socket.IO to the room.
   */
  @Post('conversations/:id/messages')
  async sendMessage(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const userId = req.user!.userId;
    const { message, partnerId } = await this.chatService.sendMessage(
      userId,
      conversationId,
      dto.content,
      dto.type,
      dto.mediaUrl,
    );

    // Broadcast live over Socket.IO room and notify if offline
    await this.chatGateway.broadcastMessage(
      conversationId,
      message,
      partnerId,
      userId,
    );

    return successResponse(message, 'Message sent successfully');
  }
}

