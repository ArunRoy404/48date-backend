import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ChatGateway } from '../chat/chat.gateway.js';
import { StartGameSessionDto } from './dto/start-game.dto.js';
import { SubmitAnswerDto } from './dto/submit-answer.dto.js';
import {
  GameType,
  SessionStatus,
  MessageType,
} from '../../generated/prisma/enums.js';

@Injectable()
export class GamesService implements OnModuleInit {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Automatically seed static games and questions on startup if none exist.
   */
  async onModuleInit() {
    await this.seedGamesIfNeeded();
  }

  private async seedGamesIfNeeded() {
    try {
      const count = await this.prisma.game.count();
      if (count > 0) {
        this.logger.log('Games already seeded in database.');
        return;
      }

      this.logger.log('Seeding static games and questions...');

      await this.prisma.$transaction(async (tx) => {
        // Seed "This or That" Game
        await tx.game.create({
          data: {
            name: 'This or That 🍦',
            type: GameType.THIS_OR_THAT,
            isActive: true,
            questions: {
              create: [
                {
                  question: 'What is your morning fuel?',
                  optionA: 'Coffee',
                  optionB: 'Tea',
                  order: 1,
                },
                {
                  question: 'Which furry friend do you prefer?',
                  optionA: 'Cats',
                  optionB: 'Dogs',
                  order: 2,
                },
                {
                  question: 'What is your dream retreat?',
                  optionA: 'Beach',
                  optionB: 'Mountains',
                  order: 3,
                },
                {
                  question: 'When do you feel most alive?',
                  optionA: 'Early Bird',
                  optionB: 'Night Owl',
                  order: 4,
                },
                {
                  question: 'What is your ideal evening spend?',
                  optionA: 'Netflix & Chill',
                  optionB: 'Reading a Book',
                  order: 5,
                },
              ],
            },
          },
        });

        // Seed "Icebreaker" Game
        await tx.game.create({
          data: {
            name: 'Icebreaker Games ❄️',
            type: GameType.ICEBREAKER,
            isActive: true,
            questions: {
              create: [
                {
                  question: 'Where would you travel first?',
                  optionA: 'Paris',
                  optionB: 'Tokyo',
                  order: 1,
                },
                {
                  question: 'If you had one choice of superpower, it would be:',
                  optionA: 'Invisibility',
                  optionB: 'Flight',
                  order: 2,
                },
                {
                  question: 'Which weather suits you best?',
                  optionA: 'Sunny Summer',
                  optionB: 'Winter Chill',
                  order: 3,
                },
              ],
            },
          },
        });
      });

      this.logger.log('Static games seeded successfully.');
    } catch (err: any) {
      this.logger.error(
        `Failed to seed static games: ${(err as Error)?.message}`,
      );
    }
  }

  /**
   * Fetches all active games and their active questions.
   */
  async getGames() {
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

  /**
   * Starts a new game session or retrieves an existing active one.
   */
  async startGameSession(dto: StartGameSessionDto, userId: string) {
    const { matchId, gameId } = dto;

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot start a game on an inactive match');
    }

    if (match.userLowId !== userId && match.userHighId !== userId) {
      throw new ForbiddenException('You are not a participant in this match');
    }

    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        questions: { where: { isActive: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!game || !game.isActive) {
      throw new NotFoundException('Game not found or inactive');
    }

    // Check if an IN_PROGRESS session already exists
    let session = await this.prisma.gameSession.findFirst({
      where: {
        matchId,
        gameId,
        status: SessionStatus.IN_PROGRESS,
      },
      include: {
        answers: true,
      },
    });

    if (!session) {
      session = await this.prisma.gameSession.create({
        data: {
          matchId,
          gameId,
          status: SessionStatus.IN_PROGRESS,
        },
        include: {
          answers: true,
        },
      });
    }

    const fullSessionPayload = {
      ...session,
      game,
    };

    // Notify room via WebSockets
    await this.chatGateway.emitToMatch(
      matchId,
      'gameStarted',
      fullSessionPayload,
    );

    return fullSessionPayload;
  }

  /**
   * Gets details of a specific game session.
   */
  async getGameSession(sessionId: string, userId: string) {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        match: true,
        game: {
          include: {
            questions: { where: { isActive: true }, orderBy: { order: 'asc' } },
          },
        },
        answers: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Game session not found');
    }

    const { match } = session;
    if (match.userLowId !== userId && match.userHighId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to view this session',
      );
    }

    return session;
  }

  /**
   * Submits an answer to a question in a game session.
   */
  async submitAnswer(sessionId: string, dto: SubmitAnswerDto, userId: string) {
    const { questionId, selectedOption } = dto;

    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { match: true, game: true },
    });

    if (!session) {
      throw new NotFoundException('Game session not found');
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new BadRequestException('This game session is already completed');
    }

    const { match, game } = session;
    if (match.userLowId !== userId && match.userHighId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to participate in this session',
      );
    }

    // Verify question belongs to the game
    const question = await this.prisma.gameQuestion.findFirst({
      where: { id: questionId, gameId: game.id, isActive: true },
    });

    if (!question) {
      throw new BadRequestException(
        'Question does not belong to the active game',
      );
    }

    // Record or update the answer
    await this.prisma.gameAnswer.upsert({
      where: {
        gameSessionId_questionId_userId: {
          gameSessionId: sessionId,
          questionId,
          userId,
        },
      },
      update: {
        selectedOption,
      },
      create: {
        gameSessionId: sessionId,
        questionId,
        userId,
        selectedOption,
      },
    });

    const partnerId =
      match.userLowId === userId ? match.userHighId : match.userLowId;

    // Check if partner has also answered this question
    const partnerAnswer = await this.prisma.gameAnswer.findUnique({
      where: {
        gameSessionId_questionId_userId: {
          gameSessionId: sessionId,
          questionId,
          userId: partnerId,
        },
      },
    });

    if (!partnerAnswer) {
      // Notify partner that user has answered (do not reveal the option yet)
      await this.chatGateway.emitToMatch(match.id, 'partnerAnswered', {
        questionId,
        userId,
      });

      return {
        answered: true,
        waitingForPartner: true,
      };
    }

    // Both have answered! Calculate match and emit roundResult
    const isMatch = selectedOption === partnerAnswer.selectedOption;
    await this.chatGateway.emitToMatch(match.id, 'roundResult', {
      questionId,
      isMatch,
      answers: [
        { userId, selectedOption },
        { userId: partnerId, selectedOption: partnerAnswer.selectedOption },
      ],
    });

    // Check if game is completed (all active questions answered by both users)
    const activeQuestions = await this.prisma.gameQuestion.findMany({
      where: { gameId: game.id, isActive: true },
    });

    const totalQuestionsCount = activeQuestions.length;

    const allSessionAnswers = await this.prisma.gameAnswer.findMany({
      where: { gameSessionId: sessionId },
    });

    // Find unique questions answered by both players
    const answersByQuestion = new Map<string, typeof allSessionAnswers>();
    for (const ans of allSessionAnswers) {
      const list = answersByQuestion.get(ans.questionId) || [];
      list.push(ans);
      answersByQuestion.set(ans.questionId, list);
    }

    let completedQuestionsCount = 0;
    let matchingAnswersCount = 0;

    for (const [, answers] of answersByQuestion.entries()) {
      if (answers.length === 2) {
        completedQuestionsCount++;
        if (answers[0].selectedOption === answers[1].selectedOption) {
          matchingAnswersCount++;
        }
      }
    }

    if (completedQuestionsCount === totalQuestionsCount) {
      // Complete game session
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      const compatibility = Math.round(
        (matchingAnswersCount / totalQuestionsCount) * 100,
      );

      // Create SYSTEM Message in the chat conversation
      const conversation = await this.prisma.conversation.findUnique({
        where: { matchId: match.id },
      });

      if (conversation) {
        const systemMessageContent = `Game Completed: ${game.name}! You scored ${compatibility}% compatibility! 🧩`;

        const systemMessage = await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: userId,
            type: MessageType.SYSTEM,
            content: systemMessageContent,
          },
        });

        // Broadcast system message to chat room
        this.chatGateway.server
          .to(conversation.id)
          .emit('newMessage', systemMessage);
      }

      // Emit gameCompleted event
      await this.chatGateway.emitToMatch(match.id, 'gameCompleted', {
        sessionId,
        compatibility,
        totalQuestions: totalQuestionsCount,
        matchingAnswers: matchingAnswersCount,
      });

      return {
        answered: true,
        waitingForPartner: false,
        completed: true,
        compatibility,
      };
    }

    return {
      answered: true,
      waitingForPartner: false,
      completed: false,
    };
  }
}
