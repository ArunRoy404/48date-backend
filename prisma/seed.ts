import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedGames } from './seeds/games.seed.js';
import { seedUsers } from './seeds/users.seed.js';
import { seedSocial } from './seeds/social.seed.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ Error: DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting 48Date database seeding...');
  // Order matters: social data references both games and users.
  await seedGames(prisma);
  const users = await seedUsers(prisma);
  await seedSocial(prisma, users);
  console.log('🎉 Database seeding completed successfully.');
}

main()
  .catch((err: unknown) => {
    console.error('❌ Seeding failed with error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
