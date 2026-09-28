import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import { env } from '../../config/env.config.js';
import { successResponse } from '../response/api-response.util.js';

/** Rejects when a promise takes longer than `ms` — a hung dependency must not hang the monitor. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

type CheckStatus = 'up' | 'down' | 'not_configured';

/**
 * GET /health — the endpoint an uptime monitor watches on the single VPS.
 *
 * The database is the one hard dependency (the API is useless without it);
 * Redis is equally load-bearing (BullMQ + chat presence) but a transient
 * Redis blip shouldn't flap a monitor while jobs retry in the background,
 * so a Redis failure is reported in the body and still 503s — both checks
 * must be up for a green answer. A missing REDIS_URL (never the case in
 * production) is reported as not_configured and does not fail the check.
 */
@Controller('health')
export class HealthController {
  /** Own connection — BullMQ's connections are private to its workers. */
  private readonly redis: Redis | null;

  constructor(private readonly prisma: PrismaService) {
    this.redis = env.REDIS_URL
      ? new Redis(env.REDIS_URL, {
          // The check itself decides success; never buffer commands while
          // connecting, and don't retry inside the client mid-healthcheck.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        })
      : null;
  }

  @Get()
  async check() {
    const [database, redis] = await Promise.allSettled([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, 3_000),
      this.redis ? withTimeout(this.redis.ping(), 3_000) : null,
    ]);

    const checks: Record<string, CheckStatus> = {
      database: database.status === 'fulfilled' ? 'up' : 'down',
      redis: !this.redis
        ? 'not_configured'
        : redis.status === 'fulfilled'
          ? 'up'
          : 'down',
    };

    const failing = Object.entries(checks)
      .filter(([, status]) => status === 'down')
      .map(([name]) => name);

    if (failing.length > 0) {
      throw new ServiceUnavailableException(
        `Health check failed: ${failing.join(', ')} ${failing.length === 1 ? 'is' : 'are'} down`,
      );
    }

    return successResponse(
      {
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        checks,
      },
      'Service is healthy',
    );
  }

  /** Called by Nest during graceful shutdown — never leave a dangling connection. */
  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      // quit() flushes pending commands; a half-dead Redis during shutdown
      // must not block process exit, so fall back to a hard disconnect.
      try {
        await Promise.race([
          this.redis.quit(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('quit timeout')), 1_000),
          ),
        ]);
      } catch {
        this.redis.disconnect();
      }
    }
  }
}
