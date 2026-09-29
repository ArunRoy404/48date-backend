import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * Smoke test — boots the real AppModule (Prisma, Redis, BullMQ, every
 * feature module) and verifies the service actually serves requests.
 *
 * Requires the local Postgres (:5433) and Redis (:6379) containers:
 *   docker compose up -d postgres redis
 *
 * The old scaffold asserted `GET /` → "Hello World!", a route that has
 * never existed in this app, so `npm run test:e2e` failed on every run.
 */
describe('App bootstrap (e2e)', () => {
  let app: INestApplication;

  /** Nest's getHttpServer() is typed `any` — give supertest a truthful handle. */
  const supertest = () => request(app.getHttpServer() as never);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<INestApplication>();
    // Keep in sync with main.ts — global pipe + envelope filter.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        stopAtFirstError: true,
      }),
    );
    await app.init();
  });

  it('GET /health is public and reports all dependencies up', () => {
    return supertest()
      .get('/health')
      .expect(200)
      .expect((res) => {
        // Typed view of the response envelope — supertest's body is any.
        const body = res.body as {
          success: boolean;
          data: {
            status: string;
            checks: Record<string, string>;
          };
        };
        expect(body.success).toBe(true);
        expect(body.data.status).toBe('ok');
        expect(body.data.checks.database).toBe('up');
        expect(body.data.checks.redis).toBe('up');
      });
  });

  it('an unauthenticated API route is rejected with 401, not 404', () => {
    // Proves routing + the global JWT guard are live, not just the health route.
    return supertest().get('/users/profile').expect(401);
  });

  afterAll(async () => {
    await app.close();
  });
});
