import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { env } from '../../config/env.config.js';

/**
 * Global rate-limit guard, armed by RATE_LIMIT_ENABLED (default false).
 *
 * When disabled it passes every request through untouched — including routes
 * that carry a stricter @Throttle override. When enabled, the standard
 * ThrottlerGuard rules apply: the global per-IP cap plus any per-route
 * overrides (the auth routes use RATE_LIMIT_AUTH_PER_MINUTE).
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!env.RATE_LIMIT_ENABLED) {
      return true;
    }
    return super.canActivate(context);
  }
}
