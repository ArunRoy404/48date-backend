import {
  Controller,
  Get,
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

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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
  }
}
