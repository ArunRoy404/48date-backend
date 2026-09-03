import {
  Controller,
  Get,
  Post,
<<<<<<< HEAD
  Body,
  Param,
=======
  Param,
  Body,
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
<<<<<<< HEAD
import { successResponse } from '../../common/response/api-response.util.js';
import { GamesService } from './games.service.js';
import { StartGameDto, SubmitAnswerDto } from './dto/game-requests.dto.js';
=======
import { GamesService } from './games.service.js';
import { StartGameSessionDto } from './dto/start-game.dto.js';
import { SubmitAnswerDto } from './dto/submit-answer.dto.js';
import { successResponse } from '../../common/response/api-response.util.js';
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662

@Controller('games')
@UseGuards(JwtAuthGuard)
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

<<<<<<< HEAD
  @Get()
  async getGames() {
    const data = await this.gamesService.listGames();
    return successResponse(data, 'Games listed successfully');
  }

  @Post('start')
  async startGame(@Req() req: Request, @Body() dto: StartGameDto) {
    const userId = req.user!.userId;
    const data = await this.gamesService.startGameSession(
      dto.matchId,
      dto.gameId,
      userId,
    );
    return successResponse(data, 'Game session started successfully');
  }

  @Post('submit')
  async submitAnswer(@Req() req: Request, @Body() dto: SubmitAnswerDto) {
    const userId = req.user!.userId;
    const data = await this.gamesService.submitAnswer(
      dto.gameSessionId,
      userId,
      dto.questionId,
      dto.selectedOption,
    );
    return successResponse(data, 'Answer submitted successfully');
  }

  @Get('session/:id')
  async getSessionState(@Param('id') id: string) {
    const data = await this.gamesService.getGameSessionState(id);
    return successResponse(data, 'Game session state retrieved successfully');
  }
=======
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
>>>>>>> 1da36cd33c83cdd9e319d00fd0eaacc7aec32662
}
