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
import { GamesService } from './games.service.js';
import { StartGameDto, SubmitAnswerDto } from './dto/game-requests.dto.js';

@Controller('games')
@UseGuards(JwtAuthGuard)
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

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
}
