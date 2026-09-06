import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { GamesService } from './games.service.js';
import { StartGameSessionDto } from './dto/start-game.dto.js';
import { SubmitAnswerDto } from './dto/submit-answer.dto.js';
import { successResponse } from '../../common/response/api-response.util.js';

@Controller('games')
@UseGuards(JwtAuthGuard)
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  /**
   * GET /games
   * Returns a list of active games and their questions.
   */
  @Get()
  async getGames() {
    const data = await this.gamesService.getGames();
    return successResponse(data, 'Active games retrieved successfully');
  }

  /**
   * POST /games/sessions
   * Starts a new game session or retrieves an active one for a match.
   */
  @Post('sessions')
  async startGameSession(
    @Req() req: Request,
    @Body() dto: StartGameSessionDto,
  ) {
    const userId = req.user!.userId;
    const data = await this.gamesService.startGameSession(dto, userId);
    return successResponse(data, 'Game session initialized successfully');
  }

  /**
   * GET /games/sessions/:id
   * Retrieves the current state of a game session.
   */
  @Get('sessions/:id')
  async getGameSession(@Req() req: Request, @Param('id') sessionId: string) {
    const userId = req.user!.userId;
    const data = await this.gamesService.getGameSession(sessionId, userId);
    return successResponse(data, 'Game session retrieved successfully');
  }

  /**
   * POST /games/sessions/:id/answers
   * Submits an answer to a question in the game session.
   */
  @Post('sessions/:id/answers')
  async submitAnswer(
    @Req() req: Request,
    @Param('id') sessionId: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    const userId = req.user!.userId;
    const data = await this.gamesService.submitAnswer(sessionId, dto, userId);
    return successResponse(data, 'Answer submitted successfully');
  }
}
