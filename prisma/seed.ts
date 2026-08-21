import 'dotenv/config';
import { PrismaClient, GameType } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding games and questions...');

  // 1. This or That Game
  const thisOrThat = await prisma.game.upsert({
    where: { id: 'this-or-that-game-id' }, // constant ID for easy seeding / references
    update: {},
    create: {
      id: 'this-or-that-game-id',
      name: 'This or That: Fun Edition',
      type: GameType.THIS_OR_THAT,
      isActive: true,
    },
  });

  const thisOrThatQuestions = [
    {
      id: 'tot-q1',
      question: 'Cats or Dogs?',
      optionA: 'Cats',
      optionB: 'Dogs',
      order: 1,
    },
    {
      id: 'tot-q2',
      question: 'Coffee or Tea?',
      optionA: 'Coffee',
      optionB: 'Tea',
      order: 2,
    },
    {
      id: 'tot-q3',
      question: 'Summer or Winter?',
      optionA: 'Summer',
      optionB: 'Winter',
      order: 3,
    },
    {
      id: 'tot-q4',
      question: 'Early Bird or Night Owl?',
      optionA: 'Early Bird',
      optionB: 'Night Owl',
      order: 4,
    },
  ];

  for (const q of thisOrThatQuestions) {
    await prisma.gameQuestion.upsert({
      where: { id: q.id },
      update: {
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        order: q.order,
      },
      create: {
        id: q.id,
        gameId: thisOrThat.id,
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        order: q.order,
        isActive: true,
      },
    });
  }

  // 2. Icebreaker Game
  const icebreaker = await prisma.game.upsert({
    where: { id: 'icebreaker-game-id' },
    update: {},
    create: {
      id: 'icebreaker-game-id',
      name: 'Deep Connections',
      type: GameType.ICEBREAKER,
      isActive: true,
    },
  });

  const icebreakerQuestions = [
    {
      id: 'ib-q1',
      question: 'Would you rather travel to the past or the future?',
      optionA: 'Past',
      optionB: 'Future',
      order: 1,
    },
    {
      id: 'ib-q2',
      question: 'Would you rather live in a bustling city or a quiet cabin?',
      optionA: 'Bustling City',
      optionB: 'Quiet Cabin',
      order: 2,
    },
    {
      id: 'ib-q3',
      question: 'Would you rather have unlimited money or unlimited time?',
      optionA: 'Unlimited Money',
      optionB: 'Unlimited Time',
      order: 3,
    },
  ];

  for (const q of icebreakerQuestions) {
    await prisma.gameQuestion.upsert({
      where: { id: q.id },
      update: {
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        order: q.order,
      },
      create: {
        id: q.id,
        gameId: icebreaker.id,
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        order: q.order,
        isActive: true,
      },
    });
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
