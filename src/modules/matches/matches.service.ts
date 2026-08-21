import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MatchStatus } from '../../generated/prisma/client.js';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async validateMatch(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    if (match.userLowId !== userId && match.userHighId !== userId) {
      throw new BadRequestException('User is not a participant in this match');
    }
    if (match.status !== MatchStatus.ACTIVE) {
      throw new BadRequestException('This match is no longer active');
    }
    return match;
  }
}
