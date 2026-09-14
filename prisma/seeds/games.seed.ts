import { GameType } from '../../src/generated/prisma/enums.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

interface SeedQuestion {
  question: string;
  optionA: string;
  optionB: string;
  order: number;
}

interface SeedGame {
  name: string;
  type: GameType;
  questions: SeedQuestion[];
}

const SEED_GAMES: SeedGame[] = [
  {
    name: 'This or That 🍦',
    type: GameType.THIS_OR_THAT,
    questions: [
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
      {
        question: 'What is your preferred vacation style?',
        optionA: 'Spontaneous Adventure',
        optionB: 'Well-planned Itinerary',
        order: 6,
      },
      {
        question: 'Dinner on a Friday night?',
        optionA: 'Cook Together at Home',
        optionB: 'Try a New Restaurant',
        order: 7,
      },
    ],
  },
  {
    name: 'Icebreaker Games ❄️',
    type: GameType.ICEBREAKER,
    questions: [
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
      {
        question: 'In an unexpected zombie apocalypse, you would be:',
        optionA: 'The Bold Leader',
        optionB: 'The Clever Strategist',
        order: 4,
      },
      {
        question: 'Your go-to weekend vibe is:',
        optionA: 'High Energy & Socializing',
        optionB: 'Quiet Rest & Recharging',
        order: 5,
      },
    ],
  },
  {
    name: 'Deep Connections 💬',
    type: GameType.ICEBREAKER,
    questions: [
      {
        question: 'What matters more in a lasting relationship?',
        optionA: 'Instant Chemistry & Excitement',
        optionB: 'Shared Values & Deep Trust',
        order: 1,
      },
      {
        question: 'How do you best process intense emotions?',
        optionA: 'Talking It Out Right Away',
        optionB: 'Taking Time Alone to Reflect',
        order: 2,
      },
      {
        question: 'What sparks your curiosity the most?',
        optionA: 'Art, Music & Human Stories',
        optionB: 'Science, Tech & How Things Work',
        order: 3,
      },
    ],
  },
  {
    name: 'Date Night Dilemmas 🤔',
    type: GameType.THIS_OR_THAT,
    questions: [
      {
        question: 'First date ambiance preference:',
        optionA: 'Cozy Neighborhood Cafe',
        optionB: 'Lively Rooftop Restaurant',
        order: 1,
      },
      {
        question: 'Music choice for a late night drive:',
        optionA: 'Sing-along Throwback Classics',
        optionB: 'Deep Chill & Lo-Fi Beats',
        order: 2,
      },
      {
        question: 'Dessert to share at the end of the night:',
        optionA: 'Warm Molten Chocolate Cake',
        optionB: 'Refreshing Artisanal Gelato',
        order: 3,
      },
    ],
  },
];

export async function seedGames(prisma: PrismaClient): Promise<void> {
  console.log('🎮 Seeding games and questions...');

  for (const gameData of SEED_GAMES) {
    const existingGame = await prisma.game.findFirst({
      where: {
        name: gameData.name,
        type: gameData.type,
      },
      include: {
        questions: true,
      },
    });

    if (!existingGame) {
      const created = await prisma.game.create({
        data: {
          name: gameData.name,
          type: gameData.type,
          isActive: true,
          questions: {
            create: gameData.questions.map((q) => ({
              question: q.question,
              optionA: q.optionA,
              optionB: q.optionB,
              order: q.order,
              isActive: true,
            })),
          },
        },
      });
      console.log(
        `  ➕ Created game: "${created.name}" with ${gameData.questions.length} questions`,
      );
    } else {
      await prisma.game.update({
        where: { id: existingGame.id },
        data: { isActive: true },
      });

      let addedCount = 0;
      let updatedCount = 0;

      for (const q of gameData.questions) {
        const existingQuestion = await prisma.gameQuestion.findFirst({
          where: {
            gameId: existingGame.id,
            question: q.question,
          },
        });

        if (!existingQuestion) {
          await prisma.gameQuestion.create({
            data: {
              gameId: existingGame.id,
              question: q.question,
              optionA: q.optionA,
              optionB: q.optionB,
              order: q.order,
              isActive: true,
            },
          });
          addedCount++;
        } else {
          await prisma.gameQuestion.update({
            where: { id: existingQuestion.id },
            data: {
              optionA: q.optionA,
              optionB: q.optionB,
              order: q.order,
              isActive: true,
            },
          });
          updatedCount++;
        }
      }

      console.log(
        `  🔄 Synced game: "${existingGame.name}" (${addedCount} questions added, ${updatedCount} verified)`,
      );
    }
  }

  console.log('✅ Games and questions seeded idempotently.');
}
