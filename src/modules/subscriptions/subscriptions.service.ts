/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../generated/prisma/enums.js';
import { env } from '../../config/env.config.js';
import type { RevenueCatWebhookDto } from './dto/revenuecat-webhook.dto.js';
import type {
  SubscriptionPlanItem,
  SubscriptionMeResponse,
  FormattedSubscription,
} from './types/subscriptions.types.js';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  // Canonical plan catalog displayed on the paywall screen
  private readonly plansCatalog: SubscriptionPlanItem[] = [
    {
      id: SubscriptionPlan.WEEKLY,
      name: 'Weekly Premium',
      productId: 'com.date48.weekly',
      priceUsd: 4.99,
      billingPeriod: '1 week',
      features: [
        'Unlimited Likes',
        'See Who Liked You',
        '5 Super Likes / day',
        'Priority in Date Planner',
      ],
    },
    {
      id: SubscriptionPlan.MONTHLY,
      name: 'Monthly Premium',
      productId: 'com.date48.monthly',
      priceUsd: 14.99,
      billingPeriod: '1 month',
      features: [
        'All Weekly Features',
        'Free Monthly Profile Boost (1x)',
        'Advanced Discovery Filters',
        'Unlimited Pass Rewinds',
      ],
    },
    {
      id: SubscriptionPlan.YEARLY,
      name: 'Yearly VIP',
      productId: 'com.date48.yearly',
      priceUsd: 99.99,
      billingPeriod: '1 year',
      discountText: 'Save 45%',
      features: [
        'All Monthly Features',
        'VIP Golden Badge on Profile',
        'Instant +10 Trust Score Boost',
        'Top Visibility in Discovery Feed',
      ],
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /subscriptions/plans
   * Returns all available packages and details for the Flutter paywall.
   */
  getPlans(): SubscriptionPlanItem[] {
    return this.plansCatalog;
  }

  /**
   * GET /subscriptions/me
   * Returns the current user's active subscription and entitlement status.
   */
  async getMySubscription(userId: string): Promise<SubscriptionMeResponse> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });

    if (!subscription) {
      return {
        isPremium: false,
        subscription: null,
        activePlan: null,
      };
    }

    const now = new Date();
    const isExpired =
      subscription.status === SubscriptionStatus.EXPIRED ||
      (subscription.expiresAt !== null && subscription.expiresAt < now);

    const isPremium =
      subscription.status === SubscriptionStatus.ACTIVE && !isExpired;

    const activePlan =
      this.plansCatalog.find((p) => p.id === subscription.plan) ?? null;

    const formattedSub: FormattedSubscription = {
      id: subscription.id,
      userId: subscription.userId,
      plan: subscription.plan,
      provider: subscription.provider,
      productId: subscription.productId,
      priceUsd: subscription.priceUsd ? Number(subscription.priceUsd) : null,
      status: isExpired ? SubscriptionStatus.EXPIRED : subscription.status,
      startedAt: subscription.startedAt,
      expiresAt: subscription.expiresAt,
      cancelledAt: subscription.cancelledAt,
    };

    return {
      isPremium,
      subscription: formattedSub,
      activePlan: isPremium ? activePlan : null,
    };
  }

  /**
   * Maps a mobile store product ID to internal SubscriptionPlan
   */
  private mapProductIdToPlan(productId: string): SubscriptionPlan {
    const lower = productId.toLowerCase();
    if (lower.includes('week')) return SubscriptionPlan.WEEKLY;
    if (lower.includes('year') || lower.includes('annual'))
      return SubscriptionPlan.YEARLY;
    return SubscriptionPlan.MONTHLY;
  }

  /**
   * POST /subscriptions/webhook
   * Processes server-to-server webhook events from RevenueCat.
   */
  async handleWebhook(dto: RevenueCatWebhookDto, authHeader?: string) {
    // 1. Verify webhook secret if configured in production
    if (env.REVENUECAT_WEBHOOK_SECRET) {
      const token = authHeader?.replace(/^Bearer\s+/i, '');
      if (token !== env.REVENUECAT_WEBHOOK_SECRET) {
        throw new UnauthorizedException('Invalid RevenueCat webhook secret');
      }
    }

    const { event } = dto;
    if (!event || !event.id) {
      return { message: 'Ignored payload without event data' };
    }

    // 2. Idempotency check: don't process the same external event twice
    const existingEvent = await this.prisma.subscriptionEvent.findUnique({
      where: { externalEventId: event.id },
    });

    if (existingEvent) {
      this.logger.log(`Duplicate webhook event ignored: ${event.id}`);
      return { message: 'Duplicate event already processed', duplicate: true };
    }

    const userId = event.app_user_id;

    // Check if target user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      this.logger.warn(
        `RevenueCat webhook user not found in date48 DB: ${userId}`,
      );
      return { message: 'User not found in system', skipped: true };
    }

    const plan = this.mapProductIdToPlan(event.product_id);
    const expiresAt = event.expiration_at_ms
      ? new Date(event.expiration_at_ms)
      : null;
    const startedAt = event.purchased_at_ms
      ? new Date(event.purchased_at_ms)
      : new Date();
    const priceUsd = event.price_in_purchased_currency ?? null;

    let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
    let cancelledAt: Date | null = null;

    const eventType = event.type.toUpperCase();

    if (eventType.includes('CANCEL')) {
      status = SubscriptionStatus.CANCELLED;
      cancelledAt = new Date();
    } else if (eventType.includes('EXPIR')) {
      status = SubscriptionStatus.EXPIRED;
    }

    const provider = event.store
      ? event.store.toLowerCase().includes('apple')
        ? 'apple'
        : 'google'
      : 'revenuecat';

    await this.prisma.$transaction(async (tx) => {
      // Find existing subscription or create new
      let subscription = await tx.subscription.findFirst({
        where: { userId },
        orderBy: { startedAt: 'desc' },
      });

      if (!subscription) {
        subscription = await tx.subscription.create({
          data: {
            userId,
            plan,
            provider,
            productId: event.product_id,
            priceUsd,
            status,
            startedAt,
            expiresAt,
            cancelledAt,
          },
        });
      } else {
        subscription = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            plan,
            provider,
            productId: event.product_id,
            priceUsd: priceUsd ?? subscription.priceUsd,
            status,
            expiresAt: expiresAt ?? subscription.expiresAt,
            cancelledAt: cancelledAt ?? subscription.cancelledAt,
          },
        });
      }

      // Update user link
      await tx.user.update({
        where: { id: userId },
        data: { subscriptionId: subscription.id },
      });

      // Record idempotent event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          externalEventId: event.id,
          eventType: event.type,
          payload: dto as any,
          processedAt: new Date(),
        },
      });
    });

    this.logger.log(
      `RevenueCat event ${event.id} (${event.type}) processed for user ${userId}. Plan: ${plan}`,
    );

    return {
      message: 'Subscription webhook processed successfully',
      userId,
      plan,
      status,
    };
  }
}
