import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { DevicesService } from './devices.service.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';

/**
 * FCM device-token registration.
 *
 * Without this, the notification worker has nothing to send to — these
 * endpoints are the production path for every push in the app.
 */
@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  /**
   * POST /devices
   * Registers or refreshes the caller's FCM token. Called on app start and
   * whenever Firebase issues a refreshed token.
   */
  @Post()
  async registerDevice(@Req() req: Request, @Body() dto: RegisterDeviceDto) {
    const userId = req.user!.userId;
    const device = await this.devicesService.registerDevice(userId, dto);
    return successResponse(
      {
        id: device.id,
        platform: device.platform,
        registeredAt: device.createdAt,
      },
      'Device registered successfully',
    );
  }

  /**
   * DELETE /devices/:token
   * Unregisters a token — the logout-path call so push stops on this device.
   */
  @Delete(':token')
  async unregisterDevice(
    @Req() req: Request,
    @Param('token') fcmToken: string,
  ) {
    const userId = req.user!.userId;
    await this.devicesService.unregisterDevice(userId, fcmToken);
    return successResponse({ fcmToken }, 'Device unregistered successfully');
  }

  /**
   * GET /devices
   * Lists the caller's registered devices.
   */
  @Get()
  async listDevices(@Req() req: Request) {
    const userId = req.user!.userId;
    const devices = await this.devicesService.listDevices(userId);
    return successResponse(
      devices.map((d) => ({
        id: d.id,
        platform: d.platform,
        // Masked — full tokens are secrets, even to their owner's client.
        fcmTokenPreview: `${d.fcmToken.substring(0, 8)}…`,
        lastActiveAt: d.lastActiveAt,
        createdAt: d.createdAt,
      })),
      'Devices retrieved successfully',
    );
  }
}
