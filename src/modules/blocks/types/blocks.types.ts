import type { FormattedUser } from '../../../common/utils/user-formatter.js';

export interface FormattedBlock {
  id: string;
  blockerId: string;
  blockedUserId: string;
  blockedUser: FormattedUser;
  createdAt: Date;
}
