import type { TrustEventType } from '../../../generated/prisma/enums.js';

export type TrustScoreTier =
  'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'NEEDS_ATTENTION';

export interface TrustScoreDetails {
  score: number;
  tier: TrustScoreTier;
  badgeLabel: string;
  isVerified: boolean;
  stats: {
    datesCompleted: number;
    positiveFeedbacks: number;
    reportsReceived: number;
    noShows: number;
  };
  updatedAt: Date;
}

export interface FormattedTrustScoreEvent {
  id: string;
  type: TrustEventType;
  points: number;
  reason: string | null;
  createdAt: Date;
}
