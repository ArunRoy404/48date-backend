import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { RevenueCatWebhookDto } from './dto/revenuecat-webhook.dto.js';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /**
   * GET /subscriptions/plans
   * Returns available subscription tiers for the Flutter premium screen.
   */
  @Get('plans')
  getPlans() {
    const data = this.subscriptionsService.getPlans();
    return successResponse(data, 'Subscription plans retrieved successfully');
  }

  /**
   * GET /subscriptions/me
   * Returns the current authenticated user's subscription details and premium status.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMySubscription(@Req() req: Request) {
    const userId = req.user!.userId;
    const data = await this.subscriptionsService.getMySubscription(userId);
    return successResponse(
      data,
      'User subscription status retrieved successfully',
    );
  }

  /**
   * POST /subscriptions/webhook
   * Server-to-server webhook invoked by RevenueCat when purchases or status changes occur.
   */
  @Post('webhook')
  async handleWebhook(
    @Body() dto: RevenueCatWebhookDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const data = await this.subscriptionsService.handleWebhook(dto, authHeader);
    return successResponse(data, 'Webhook processed successfully');
  }
}
