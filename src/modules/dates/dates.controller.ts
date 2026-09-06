import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { DatesService } from './dates.service.js';
import { CreateDatePlanDto } from './dto/create-date-plan.dto.js';
import { UpdateDatePlanDto } from './dto/update-date-plan.dto.js';
import { GetDatesQueryDto } from './dto/get-dates-query.dto.js';
import { CancelDateDto } from './dto/cancel-date.dto.js';
import { SearchPlacesQueryDto } from './dto/search-places-query.dto.js';
import { CreateDateRatingDto } from './dto/create-date-rating.dto.js';

@Controller('dates')
@UseGuards(JwtAuthGuard)
export class DatesController {
  constructor(private readonly datesService: DatesService) {}

  /**
   * GET /dates/places/search?q=
   * Searches Mapbox Places API for locations, venues, and cafes.
   * NOTE: Placed before :id to prevent route shadowing.
   */
  @Get('places/search')
  async searchPlaces(@Query() query: SearchPlacesQueryDto) {
    const data = await this.datesService.searchPlaces(query);
    return successResponse(data, 'Places retrieved successfully');
  }

  /**
   * POST /dates
   * Plans a date invitation for an active match.
   */
  @Post()
  async createDatePlan(@Req() req: Request, @Body() dto: CreateDatePlanDto) {
    const userId = req.user!.userId;
    const data = await this.datesService.createDatePlan(userId, dto);
    return successResponse(data, 'Date invitation created successfully');
  }

  /**
   * GET /dates
   * Retrieves all dates for the authenticated user.
   */
  @Get()
  async getUserDates(@Req() req: Request, @Query() query: GetDatesQueryDto) {
    const userId = req.user!.userId;
    const data = await this.datesService.getUserDates(userId, query);
    return successResponse(data, 'Dates retrieved successfully');
  }

  /**
   * GET /dates/:id
   * Retrieves details of a specific date plan.
   */
  @Get(':id')
  async getDatePlanById(@Req() req: Request, @Param('id') datePlanId: string) {
    const userId = req.user!.userId;
    const data = await this.datesService.getDatePlanById(datePlanId, userId);
    return successResponse(data, 'Date plan retrieved successfully');
  }

  /**
   * PATCH /dates/:id
   * Updates/reschedules a date plan.
   */
  @Patch(':id')
  async updateDatePlan(
    @Req() req: Request,
    @Param('id') datePlanId: string,
    @Body() dto: UpdateDatePlanDto,
  ) {
    const userId = req.user!.userId;
    const data = await this.datesService.updateDatePlan(
      datePlanId,
      userId,
      dto,
    );
    return successResponse(data, 'Date plan updated successfully');
  }

  /**
   * POST /dates/:id/accept
   * Accepts a pending date invitation.
   */
  @Post(':id/accept')
  async acceptDatePlan(@Req() req: Request, @Param('id') datePlanId: string) {
    const userId = req.user!.userId;
    const data = await this.datesService.acceptDatePlan(datePlanId, userId);
    return successResponse(data, 'Date invitation accepted successfully');
  }

  /**
   * POST /dates/:id/decline
   * Declines a pending date invitation.
   */
  @Post(':id/decline')
  async declineDatePlan(@Req() req: Request, @Param('id') datePlanId: string) {
    const userId = req.user!.userId;
    const data = await this.datesService.declineDatePlan(datePlanId, userId);
    return successResponse(data, 'Date invitation declined successfully');
  }

  /**
   * POST /dates/:id/cancel
   * Cancels a pending or accepted date.
   */
  @Post(':id/cancel')
  async cancelDatePlan(
    @Req() req: Request,
    @Param('id') datePlanId: string,
    @Body() dto: CancelDateDto,
  ) {
    const userId = req.user!.userId;
    const data = await this.datesService.cancelDatePlan(
      datePlanId,
      userId,
      dto,
    );
    return successResponse(data, 'Date cancelled successfully');
  }

  /**
   * POST /dates/:id/complete
   * Marks an accepted date as completed.
   */
  @Post(':id/complete')
  async completeDatePlan(@Req() req: Request, @Param('id') datePlanId: string) {
    const userId = req.user!.userId;
    const data = await this.datesService.completeDatePlan(datePlanId, userId);
    return successResponse(data, 'Date marked as completed successfully');
  }

  /**
   * POST /dates/:id/ratings
   * Submits a rating for a completed date.
   */
  @Post(':id/ratings')
  async submitDateRating(
    @Req() req: Request,
    @Param('id') datePlanId: string,
    @Body() dto: CreateDateRatingDto,
  ) {
    const userId = req.user!.userId;
    const data = await this.datesService.submitDateRating(
      userId,
      datePlanId,
      dto,
    );
    return successResponse(data, 'Date rating submitted successfully');
  }

  /**
   * GET /dates/:id/ratings
   * Retrieves ratings for a completed date.
   */
  @Get(':id/ratings')
  async getDateRatings(@Req() req: Request, @Param('id') datePlanId: string) {
    const userId = req.user!.userId;
    const data = await this.datesService.getDateRatings(userId, datePlanId);
    return successResponse(data, 'Date ratings retrieved successfully');
  }
}
