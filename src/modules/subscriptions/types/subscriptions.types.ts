import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../../generated/prisma/enums.js';

export interface SubscriptionPlanItem {
  id: SubscriptionPlan;
  name: string;
  productId: string;
  priceUsd: number;
  billingPeriod: string;
  discountText?: string;
  features: string[];
}

export interface FormattedSubscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  provider: string;
  productId: string;
  priceUsd: number | null;
  status: SubscriptionStatus;
  startedAt: Date;
  expiresAt: Date | null;
  cancelledAt: Date | null;
}

export interface SubscriptionMeResponse {
  isPremium: boolean;
  subscription: FormattedSubscription | null;
  activePlan: SubscriptionPlanItem | null;
}
