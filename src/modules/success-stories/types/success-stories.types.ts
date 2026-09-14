import type { StoryStatus } from '../../../generated/prisma/enums.js';
import type { FormattedUser } from '../../../common/utils/user-formatter.js';

export interface FormattedComment {
  id: string;
  storyId: string;
  userId: string;
  user: FormattedUser;
  content: string;
  createdAt: Date;
}

export interface FormattedSuccessStory {
  id: string;
  title: string;
  story: string;
  images: string[];
  status: StoryStatus;
  authorId: string;
  partnerId: string;
  matchId: string | null;
  author: FormattedUser;
  partner: FormattedUser;
  likeCount: number;
  commentCount: number;
  isLikedByMe: boolean;
  comments?: FormattedComment[];
  createdAt: Date;
  updatedAt: Date;
}
