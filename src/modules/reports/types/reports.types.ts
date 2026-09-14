import type { ReportStatus } from '../../../generated/prisma/enums.js';
import type { FormattedUser } from '../../../common/utils/user-formatter.js';

export interface FormattedReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reportedUser: FormattedUser;
  reason: string;
  description: string | null;
  status: ReportStatus;
  resolution: string | null;
  createdAt: Date;
}
