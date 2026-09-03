/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatUser } from '../../common/utils/user-formatter.js';
import {
  DateStatus,
  MessageType,
  NotificationType,
} from '../../generated/prisma/enums.js';
import { env } from '../../config/env.config.js';
import type { CreateDatePlanDto } from './dto/create-date-plan.dto.js';
import type { UpdateDatePlanDto } from './dto/update-date-plan.dto.js';
import type { GetDatesQueryDto } from './dto/get-dates-query.dto.js';
import type { CancelDateDto } from './dto/cancel-date.dto.js';
import type { SearchPlacesQueryDto } from './dto/search-places-query.dto.js';
import type {
  FormattedDatePlan,
  PlaceSearchResult,
} from './types/dates.types.js';

@Injectable()
export class DatesService {
  private readonly logger = new Logger(DatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Formats a raw Prisma DatePlan record into the standard response shape
   * including formatted user profiles for both participants.
   */
  private formatDatePlan(
    rawPlan: any,
    currentUserId: string,
  ): FormattedDatePlan {
    const isProposer = rawPlan.proposerId === currentUserId;
    const counterpart = isProposer ? rawPlan.receiver : rawPlan.proposer;

    return {
      id: rawPlan.id,
      matchId: rawPlan.matchId,
      proposerId: rawPlan.proposerId,
      receiverId: rawPlan.receiverId,
      proposer: formatUser(rawPlan.proposer),
      receiver: formatUser(rawPlan.receiver),
      counterpartUser: formatUser(counterpart),
      venueName: rawPlan.venueName,
      venueAddress: rawPlan.venueAddress,
      latitude: rawPlan.latitude ?? null,
      longitude: rawPlan.longitude ?? null,
      mapboxPlaceId: rawPlan.mapboxPlaceId ?? null,
      date: rawPlan.date,
      startTime: rawPlan.startTime,
      endTime: rawPlan.endTime ?? null,
      status: rawPlan.status,
      createdAt: rawPlan.createdAt,
      updatedAt: rawPlan.updatedAt,
    };
  }

  /**
   * POST /dates
   * Creates a new Date invitation for an active match.
   * Also posts a DATE_INVITE message to the conversation and sends a notification.
   */
  async createDatePlan(
    userId: string,
    dto: CreateDatePlanDto,
  ): Promise<FormattedDatePlan> {
    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
      include: {
        conversation: true,
      },
    });

    if (!match || match.status !== 'ACTIVE') {
      throw new NotFoundException('Active match not found');
    }

    if (match.userLowId !== userId && match.userHighId !== userId) {
      throw new ForbiddenException('You are not a participant of this match');
    }

    const counterpartId =
      match.userLowId === userId ? match.userHighId : match.userLowId;
    const receiverId = dto.receiverId || counterpartId;

    if (receiverId !== counterpartId) {
      throw new BadRequestException(
        'The specified receiverId does not match your counterpart in this match',
      );
    }

    // Check if an invitation or date is already active/pending for this match
    const existingActive = await this.prisma.datePlan.findFirst({
      where: {
        matchId: dto.matchId,
        status: { in: [DateStatus.PENDING, DateStatus.ACCEPTED] },
      },
    });

    if (existingActive) {
      throw new ConflictException(
        `There is already an active date invitation (${existingActive.status}) for this match`,
      );
    }

    const dateObj = new Date(dto.date);
    const startTimeObj = new Date(dto.startTime);
    const endTimeObj = dto.endTime ? new Date(dto.endTime) : null;

    if (isNaN(dateObj.getTime()) || isNaN(startTimeObj.getTime())) {
      throw new BadRequestException('Invalid date or startTime format');
    }

    if (endTimeObj && endTimeObj <= startTimeObj) {
      throw new BadRequestException('endTime must be after startTime');
    }

    const createdPlan = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.datePlan.create({
        data: {
          matchId: dto.matchId,
          proposerId: userId,
          receiverId,
          venueName: dto.venueName,
          venueAddress: dto.venueAddress,
          latitude: dto.latitude,
          longitude: dto.longitude,
          mapboxPlaceId: dto.mapboxPlaceId,
          date: dateObj,
          startTime: startTimeObj,
          endTime: endTimeObj,
          status: DateStatus.PENDING,
        },
        include: {
          proposer: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
          receiver: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });

      // Synchronize with chat conversation if active
      if (match.conversation) {
        await tx.message.create({
          data: {
            conversationId: match.conversation.id,
            senderId: userId,
            content: JSON.stringify({
              type: 'DATE_INVITE',
              datePlanId: plan.id,
              venueName: plan.venueName,
              venueAddress: plan.venueAddress,
              date: plan.date,
              startTime: plan.startTime,
              status: plan.status,
            }),
            type: MessageType.DATE_INVITE,
          },
        });

        await tx.conversation.update({
          where: { id: match.conversation.id },
          data: { updatedAt: new Date() },
        });
      }

      // Create notification for receiver
      await tx.notification.create({
        data: {
          userId: receiverId,
          type: NotificationType.DATE_INVITE,
          title: 'New Date Invitation!',
          body: `${plan.proposer.name || 'Your match'} invited you to a date at ${plan.venueName}`,
          data: {
            datePlanId: plan.id,
            matchId: plan.matchId,
          },
        },
      });

      return plan;
    });

    return this.formatDatePlan(createdPlan, userId);
  }

  /**
   * GET /dates
   * Retrieves all date plans for the logged-in user with optional status, match, or upcoming filters.
   */
  async getUserDates(
    userId: string,
    query: GetDatesQueryDto,
  ): Promise<FormattedDatePlan[]> {
    const where: any = {
      OR: [{ proposerId: userId }, { receiverId: userId }],
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.matchId) {
      where.matchId = query.matchId;
    }

    if (query.upcoming) {
      where.startTime = { gte: new Date() };
      if (!query.status) {
        where.status = { in: [DateStatus.PENDING, DateStatus.ACCEPTED] };
      }
    }

    const plans = await this.prisma.datePlan.findMany({
      where,
      include: {
        proposer: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        receiver: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: query.upcoming ? { startTime: 'asc' } : { createdAt: 'desc' },
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });

    return plans.map((plan) => this.formatDatePlan(plan, userId));
  }

  /**
   * GET /dates/:id
   * Retrieves details for a specific date plan.
   */
  async getDatePlanById(
    datePlanId: string,
    userId: string,
  ): Promise<FormattedDatePlan> {
    const plan = await this.prisma.datePlan.findUnique({
      where: { id: datePlanId },
      include: {
        proposer: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        receiver: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        ratings: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Date plan not found');
    }

    if (plan.proposerId !== userId && plan.receiverId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to view this date plan',
      );
    }

    return this.formatDatePlan(plan, userId);
  }

  /**
   * PATCH /dates/:id
   * Updates date plan details (e.g. reschedule or change venue).
   */
  async updateDatePlan(
    datePlanId: string,
    userId: string,
    dto: UpdateDatePlanDto,
  ): Promise<FormattedDatePlan> {
    const plan = await this.prisma.datePlan.findUnique({
      where: { id: datePlanId },
      include: {
        match: { include: { conversation: true } },
        proposer: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        receiver: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Date plan not found');
    }

    if (plan.proposerId !== userId && plan.receiverId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to modify this date plan',
      );
    }

    if (
      plan.status !== DateStatus.PENDING &&
      plan.status !== DateStatus.ACCEPTED &&
      plan.status !== DateStatus.DRAFT
    ) {
      throw new BadRequestException(
        `Cannot modify a date with status ${plan.status}`,
      );
    }

    const updateData: any = {};

    if (dto.date) {
      const d = new Date(dto.date);
      if (isNaN(d.getTime())) {
        throw new BadRequestException('Invalid date format');
      }
      updateData.date = d;
    }

    if (dto.startTime) {
      const st = new Date(dto.startTime);
      if (isNaN(st.getTime())) {
        throw new BadRequestException('Invalid startTime format');
      }
      updateData.startTime = st;
    }

    if (dto.endTime) {
      const et = new Date(dto.endTime);
      if (isNaN(et.getTime())) {
        throw new BadRequestException('Invalid endTime format');
      }
      updateData.endTime = et;
    }

    if (dto.venueName !== undefined) updateData.venueName = dto.venueName;
    if (dto.venueAddress !== undefined)
      updateData.venueAddress = dto.venueAddress;
    if (dto.latitude !== undefined) updateData.latitude = dto.latitude;
    if (dto.longitude !== undefined) updateData.longitude = dto.longitude;
    if (dto.mapboxPlaceId !== undefined)
      updateData.mapboxPlaceId = dto.mapboxPlaceId;

    // If already accepted and critical schedule/venue changes occur,
    // reset to PENDING so the counterpart re-confirms the change.
    const isReschedule =
      dto.date || dto.startTime || dto.venueName || dto.venueAddress;
    if (plan.status === DateStatus.ACCEPTED && isReschedule) {
      updateData.status = DateStatus.PENDING;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.datePlan.update({
        where: { id: datePlanId },
        data: updateData,
        include: {
          proposer: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
          receiver: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });

      const otherUserId =
        plan.proposerId === userId ? plan.receiverId : plan.proposerId;

      // Notify other user about changes
      await tx.notification.create({
        data: {
          userId: otherUserId,
          type: NotificationType.DATE_INVITE,
          title: 'Date Plan Updated',
          body: `The details for your date at ${result.venueName} have been updated.`,
          data: {
            datePlanId: result.id,
            matchId: result.matchId,
          },
        },
      });

      if (plan.match.conversation) {
        await tx.message.create({
          data: {
            conversationId: plan.match.conversation.id,
            senderId: userId,
            content: `Date plan details were updated for ${result.venueName}.`,
            type: MessageType.SYSTEM,
          },
        });
      }

      return result;
    });

    return this.formatDatePlan(updated, userId);
  }

  /**
   * POST /dates/:id/accept
   * Accepts a pending date invitation. Only the receiver can accept.
   */
  async acceptDatePlan(
    datePlanId: string,
    userId: string,
  ): Promise<FormattedDatePlan> {
    const plan = await this.prisma.datePlan.findUnique({
      where: { id: datePlanId },
      include: {
        match: { include: { conversation: true } },
        proposer: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        receiver: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Date plan not found');
    }

    if (plan.receiverId !== userId) {
      throw new ForbiddenException(
        'Only the invited recipient can accept this date invitation',
      );
    }

    if (plan.status !== DateStatus.PENDING) {
      throw new BadRequestException(
        `Cannot accept date invitation with status ${plan.status}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const acceptedPlan = await tx.datePlan.update({
        where: { id: datePlanId },
        data: { status: DateStatus.ACCEPTED },
        include: {
          proposer: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
          receiver: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });

      // Post confirmation message to chat conversation
      if (plan.match.conversation) {
        await tx.message.create({
          data: {
            conversationId: plan.match.conversation.id,
            senderId: userId,
            content: `Date invitation accepted! See you at ${acceptedPlan.venueName}.`,
            type: MessageType.SYSTEM,
          },
        });

        await tx.conversation.update({
          where: { id: plan.match.conversation.id },
          data: { updatedAt: new Date() },
        });
      }

      // Notify the proposer
      await tx.notification.create({
        data: {
          userId: plan.proposerId,
          type: NotificationType.DATE_INVITE,
          title: 'Date Invitation Accepted! 🎉',
          body: `${plan.receiver.name || 'Your match'} accepted your date invitation to ${acceptedPlan.venueName}!`,
          data: {
            datePlanId: acceptedPlan.id,
            matchId: acceptedPlan.matchId,
          },
        },
      });

      return acceptedPlan;
    });

    return this.formatDatePlan(updated, userId);
  }

  /**
   * POST /dates/:id/decline
   * Declines a pending date invitation. Only the receiver can decline.
   */
  async declineDatePlan(
    datePlanId: string,
    userId: string,
  ): Promise<FormattedDatePlan> {
    const plan = await this.prisma.datePlan.findUnique({
      where: { id: datePlanId },
      include: {
        match: { include: { conversation: true } },
        proposer: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        receiver: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Date plan not found');
    }

    if (plan.receiverId !== userId) {
      throw new ForbiddenException(
        'Only the invited recipient can decline this date invitation',
      );
    }

    if (plan.status !== DateStatus.PENDING) {
      throw new BadRequestException(
        `Cannot decline date invitation with status ${plan.status}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const declinedPlan = await tx.datePlan.update({
        where: { id: datePlanId },
        data: { status: DateStatus.DECLINED },
        include: {
          proposer: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
          receiver: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });

      if (plan.match.conversation) {
        await tx.message.create({
          data: {
            conversationId: plan.match.conversation.id,
            senderId: userId,
            content: 'Date invitation was declined.',
            type: MessageType.SYSTEM,
          },
        });
      }

      await tx.notification.create({
        data: {
          userId: plan.proposerId,
          type: NotificationType.SYSTEM,
          title: 'Date Invitation Declined',
          body: `${plan.receiver.name || 'Your match'} declined the date invitation.`,
          data: {
            datePlanId: declinedPlan.id,
            matchId: declinedPlan.matchId,
          },
        },
      });

      return declinedPlan;
    });

    return this.formatDatePlan(updated, userId);
  }

  /**
   * POST /dates/:id/cancel
   * Cancels a pending or accepted date plan. Either participant can cancel.
   */
  async cancelDatePlan(
    datePlanId: string,
    userId: string,
    dto?: CancelDateDto,
  ): Promise<FormattedDatePlan> {
    const plan = await this.prisma.datePlan.findUnique({
      where: { id: datePlanId },
      include: {
        match: { include: { conversation: true } },
        proposer: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        receiver: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Date plan not found');
    }

    if (plan.proposerId !== userId && plan.receiverId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to cancel this date plan',
      );
    }

    if (
      plan.status !== DateStatus.PENDING &&
      plan.status !== DateStatus.ACCEPTED
    ) {
      throw new BadRequestException(
        `Cannot cancel a date with status ${plan.status}`,
      );
    }

    const otherUserId =
      plan.proposerId === userId ? plan.receiverId : plan.proposerId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelledPlan = await tx.datePlan.update({
        where: { id: datePlanId },
        data: { status: DateStatus.CANCELLED },
        include: {
          proposer: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
          receiver: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });

      const cancellingUser =
        plan.proposerId === userId ? plan.proposer : plan.receiver;
      const reasonMsg = dto?.reason ? ` Reason: ${dto.reason}` : '';

      if (plan.match.conversation) {
        await tx.message.create({
          data: {
            conversationId: plan.match.conversation.id,
            senderId: userId,
            content: `Date to ${cancelledPlan.venueName} was cancelled by ${cancellingUser.name || 'user'}.${reasonMsg}`,
            type: MessageType.SYSTEM,
          },
        });
      }

      await tx.notification.create({
        data: {
          userId: otherUserId,
          type: NotificationType.SYSTEM,
          title: 'Date Cancelled',
          body: `Your date at ${cancelledPlan.venueName} was cancelled.${reasonMsg}`,
          data: {
            datePlanId: cancelledPlan.id,
            matchId: cancelledPlan.matchId,
          },
        },
      });

      return cancelledPlan;
    });

    return this.formatDatePlan(updated, userId);
  }

  /**
   * POST /dates/:id/complete
   * Marks an accepted date plan as completed. Either participant can mark complete.
   */
  async completeDatePlan(
    datePlanId: string,
    userId: string,
  ): Promise<FormattedDatePlan> {
    const plan = await this.prisma.datePlan.findUnique({
      where: { id: datePlanId },
      include: {
        match: { include: { conversation: true } },
        proposer: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
        receiver: {
          include: { images: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Date plan not found');
    }

    if (plan.proposerId !== userId && plan.receiverId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to complete this date plan',
      );
    }

    if (plan.status !== DateStatus.ACCEPTED) {
      throw new BadRequestException(
        `Only accepted dates can be completed (current status: ${plan.status})`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const completedPlan = await tx.datePlan.update({
        where: { id: datePlanId },
        data: { status: DateStatus.COMPLETED },
        include: {
          proposer: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
          receiver: {
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });

      if (plan.match.conversation) {
        await tx.message.create({
          data: {
            conversationId: plan.match.conversation.id,
            senderId: userId,
            content: `Date marked as completed! Hope you two had a memorable time!`,
            type: MessageType.SYSTEM,
          },
        });
      }

      return completedPlan;
    });

    return this.formatDatePlan(updated, userId);
  }

  /**
   * GET /dates/places/search?q=
   * Searches Mapbox Geocoding places API, with graceful fallback to sample places
   * if no Mapbox token is configured or network fails.
   */
  async searchPlaces(
    query: SearchPlacesQueryDto,
  ): Promise<PlaceSearchResult[]> {
    const { q, latitude, longitude, limit = 10 } = query;

    if (env.MAPBOX_ACCESS_TOKEN) {
      try {
        const proximityParam =
          latitude !== undefined && longitude !== undefined
            ? `&proximity=${longitude},${latitude}`
            : '';
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          q,
        )}.json?access_token=${env.MAPBOX_ACCESS_TOKEN}&autocomplete=true&limit=${limit}${proximityParam}`;

        const response = await fetch(url);
        if (response.ok) {
          const data: any = await response.json();
          if (Array.isArray(data.features) && data.features.length > 0) {
            return (data.features as any[]).map(
              (feature: any): PlaceSearchResult => ({
                id: (feature.id || feature.place_name || '') as string,
                name: (feature.text || feature.place_name || '') as string,
                address: (feature.place_name || feature.text || '') as string,
                latitude: feature.center ? Number(feature.center[1]) : 0,
                longitude: feature.center ? Number(feature.center[0]) : 0,
                category: (feature.properties?.category ||
                  feature.place_type?.[0] ||
                  '') as string,
              }),
            );
          }
        } else {
          this.logger.warn(
            `Mapbox API returned status ${response.status}: ${await response.text()}`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Error calling Mapbox Geocoding API: ${err?.message}`,
        );
      }
    } else {
      this.logger.warn(
        'MAPBOX_ACCESS_TOKEN not configured. Returning fallback sample places for development/testing.',
      );
    }

    // Fallback sample places matching the query query term
    return this.getFallbackPlaces(q, latitude, longitude, limit);
  }

  /**
   * Generates realistic sample places for local testing when Mapbox token is absent
   */
  private getFallbackPlaces(
    query: string,
    baseLat?: number,
    baseLng?: number,
    limit = 10,
  ): PlaceSearchResult[] {
    const centerLat = baseLat ?? 23.7925;
    const centerLng = baseLng ?? 90.4078;

    const templates = [
      {
        suffix: 'Cafe & Bistro',
        address: 'Gulshan Avenue, Block 2',
        cat: 'cafe',
      },
      {
        suffix: 'Rooftop Lounge & Bar',
        address: 'Banani 11, Lake View',
        cat: 'lounge',
      },
      {
        suffix: 'Fine Dining Restaurant',
        address: 'Dhanmondi Road 27',
        cat: 'restaurant',
      },
      {
        suffix: 'Coffee Roasters',
        address: 'Uttara Sector 3',
        cat: 'cafe',
      },
      {
        suffix: 'Botanical Garden & Walk',
        address: 'Mirpur Zoo Road',
        cat: 'park',
      },
    ];

    const results: PlaceSearchResult[] = [];
    const count = Math.min(templates.length, limit);

    for (let i = 0; i < count; i++) {
      const t = templates[i];
      results.push({
        id: `sample_place_${i + 1}`,
        name: `${query.charAt(0).toUpperCase() + query.slice(1)} ${t.suffix}`,
        address: `${i * 12 + 10} ${t.address}`,
        latitude: Number((centerLat + (i - 2) * 0.005).toFixed(6)),
        longitude: Number((centerLng + (i - 2) * 0.005).toFixed(6)),
        category: t.cat,
      });
    }

    return results;
  }
}
