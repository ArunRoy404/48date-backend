import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SessionStatus, MessageType } from '../../generated/prisma/client.js';

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  async listGames() {
    return this.prisma.game.findMany({
      where: { isActive: true },
      include: {
        questions: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async startGameSession(matchId: string, gameId: string, startedById: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
    });
    if (!game || !game.isActive) {
      throw new NotFoundException('Game not found or inactive');
    }

    // Check if there is an active session for this match and game
    let session = await this.prisma.gameSession.findFirst({
      where: {
        matchId,
        gameId,
        status: SessionStatus.IN_PROGRESS,
      },
    });

    if (!session) {
      session = await this.prisma.gameSession.create({
        data: {
          matchId,
          gameId,
          status: SessionStatus.IN_PROGRESS,
        },
      });

      // Automatically create a GAME chat message
      const conversation = await this.prisma.conversation.findUnique({
        where: { matchId },
      });
      if (conversation) {
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: startedById,
            type: MessageType.GAME,
            content: 'Started a game session',
            gameSessionId: session.id,
          },
        });
      }
    }

    return session;
  }

  async submitAnswer(
    gameSessionId: string,
    userId: string,
    questionId: string,
    selectedOption: string,
  ) {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: gameSessionId },
      include: {
        game: {
          include: {
            questions: {
              where: { isActive: true },
            },
          },
        },
        match: true,
      },
    });
    if (!session) {
      throw new NotFoundException('Game session not found');
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new BadRequestException('This game session is already completed');
    }

    // Verify question is part of the game
    const question = session.game.questions.find((q) => q.id === questionId);
    if (!question) {
      throw new BadRequestException('Question is not part of this game');
    }

    // Verify user is in the match
    if (
      session.match.userLowId !== userId &&
      session.match.userHighId !== userId
    ) {
      throw new BadRequestException(
        'User is not a participant in this game session',
      );
    }

    // Record the answer
    await this.prisma.gameAnswer.upsert({
      where: {
        gameSessionId_questionId_userId: {
          gameSessionId,
          questionId,
          userId,
        },
      },
      update: { selectedOption, answeredAt: new Date() },
      create: {
        gameSessionId,
        questionId,
        userId,
        selectedOption,
      },
    });

    // Check if both users have answered all questions in this game session
    const totalQuestions = session.game.questions.length;

    // Count answers for this session
    const answers = await this.prisma.gameAnswer.findMany({
      where: { gameSessionId },
    });

    // We have 2 participants. If we have 2 * totalQuestions answers, everyone answered everything.
    const lowAnswers = answers.filter(
      (a) => a.userId === session.match.userLowId,
    ).length;
    const highAnswers = answers.filter(
      (a) => a.userId === session.match.userHighId,
    ).length;

    if (lowAnswers >= totalQuestions && highAnswers >= totalQuestions) {
      await this.prisma.gameSession.update({
        where: { id: gameSessionId },
        data: {
          status: SessionStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      // Automatically create a SYSTEM chat message for completion
      const conversation = await this.prisma.conversation.findUnique({
        where: { matchId: session.matchId },
      });
      if (conversation) {
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: userId,
            type: MessageType.SYSTEM,
            content: 'Game session completed!',
            gameSessionId: session.id,
          },
        });
      }
    }

    // Get the current session state with answers
    return this.prisma.gameSession.findUnique({
      where: { id: gameSessionId },
      include: {
        answers: true,
        game: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });
  }

  async getGameSessionState(gameSessionId: string) {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: gameSessionId },
      include: {
        answers: true,
        game: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Game session not found');
    }
    return session;
  }
}
