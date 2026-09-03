import type { DateStatus } from '../../../generated/prisma/enums.js';
import type { FormattedUser } from '../../../common/utils/user-formatter.js';

export interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category?: string;
}

export interface FormattedDatePlan {
  id: string;
  matchId: string;
  proposerId: string;
  receiverId: string;
  proposer: FormattedUser;
  receiver: FormattedUser;
  counterpartUser: FormattedUser;
  venueName: string;
  venueAddress: string;
  latitude: number | null;
  longitude: number | null;
  mapboxPlaceId: string | null;
  date: Date;
  startTime: Date;
  endTime: Date | null;
  status: DateStatus;
  createdAt: Date;
  updatedAt: Date;
}
