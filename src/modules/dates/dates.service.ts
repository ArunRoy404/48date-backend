import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { DateStatus, MessageType } from '../../generated/prisma/client.js';

export interface CreateDatePlanDto {
  venueName: string;
  venueAddress: string;
  latitude?: number;
  longitude?: number;
  mapboxPlaceId?: string;
  date: Date | string;
  startTime: Date | string;
  endTime?: Date | string;
}

@Injectable()
export class DatesService {
  constructor(private readonly prisma: PrismaService) {}

  async createDatePlan(
    matchId: string,
    proposerId: string,
    dto: CreateDatePlanDto,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const receiverId =
      match.userLowId === proposerId ? match.userHighId : match.userLowId;

    const date = new Date(dto.date);
    const startTime = new Date(dto.startTime);
    const endTime = dto.endTime ? new Date(dto.endTime) : null;

    if (Number.isNaN(date.getTime()) || Number.isNaN(startTime.getTime())) {
      throw new BadRequestException('Invalid date or start time formats');
    }

    const datePlan = await this.prisma.datePlan.create({
      data: {
        matchId,
        proposerId,
        receiverId,
        venueName: dto.venueName,
        venueAddress: dto.venueAddress,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        mapboxPlaceId: dto.mapboxPlaceId ?? null,
        date,
        startTime,
        endTime,
        status: DateStatus.PENDING,
      },
    });

    // Automatically create a DATE_INVITE chat message
    const conversation = await this.prisma.conversation.findUnique({
      where: { matchId },
    });
    if (conversation) {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: proposerId,
          type: MessageType.DATE_INVITE,
          content: 'Proposed a date plan',
          datePlanId: datePlan.id,
        },
      });
    }

    return datePlan;
  }

  async respondToDatePlan(
    datePlanId: string,
    receiverId: string,
    accept: boolean,
  ) {
    const datePlan = await this.prisma.datePlan.findUnique({
      where: { id: datePlanId },
    });
    if (!datePlan) {
      throw new NotFoundException('Date plan not found');
    }

    if (datePlan.receiverId !== receiverId) {
      throw new BadRequestException(
        'Only the receiver can respond to this date proposal',
      );
    }

    if (datePlan.status !== DateStatus.PENDING) {
      throw new BadRequestException(
        'This date plan has already been responded to',
      );
    }

    const updated = await this.prisma.datePlan.update({
      where: { id: datePlanId },
      data: {
        status: accept ? DateStatus.ACCEPTED : DateStatus.DECLINED,
      },
    });

    // Automatically create a SYSTEM chat message
    const conversation = await this.prisma.conversation.findUnique({
      where: { matchId: datePlan.matchId },
    });
    if (conversation) {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: receiverId,
          type: MessageType.SYSTEM,
          content: accept ? 'Date plan was accepted' : 'Date plan was declined',
        },
      });
    }

    return updated;
  }

  async getDatePlan(id: string) {
    const datePlan = await this.prisma.datePlan.findUnique({
      where: { id },
      include: {
        proposer: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
      },
    });
    if (!datePlan) {
      throw new NotFoundException('Date plan not found');
    }
    return datePlan;
  }
}
