import {
  Controller,
  Get,
<<<<<<< HEAD
  Post,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { ChatService } from './chat.service.js';
=======
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
import { successResponse } from '../../common/response/api-response.util.js';
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

<<<<<<< HEAD
  @Get('conversations')
  async getConversations(@Req() req: Request) {
    const userId = req.user!.userId;
    const data = await this.chatService.getUserConversations(userId);
    return successResponse(data, 'Conversations fetched successfully');
  }

  @Post('conversations')
  async createConversation(@Body() body: { matchId: string }) {
    const data = await this.chatService.getOrCreateConversation(body.matchId);
    return successResponse(data, 'Conversation created/retrieved successfully');
  }

  @Get('conversations/:id/messages')
  async getMessages(@Req() req: Request, @Param('id') conversationId: string) {
    const userId = req.user!.userId;
    const data = await this.chatService.getMessages(conversationId, userId);
    return successResponse(data, 'Chat history retrieved successfully');
=======
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
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
  }
}
