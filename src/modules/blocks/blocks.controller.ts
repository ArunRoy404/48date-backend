import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { BlocksService } from './blocks.service.js';
import { GetBlocksQueryDto } from './dto/get-blocks-query.dto.js';

@Controller('blocks')
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  /**
   * POST /blocks/:userId
   * Blocks a target user.
   */
  @Post(':userId')
  async blockUser(@Req() req: Request, @Param('userId') blockedUserId: string) {
    const blockerId = req.user!.userId;
    const data = await this.blocksService.blockUser(blockerId, blockedUserId);
    return successResponse(data, 'User blocked successfully');
  }

  /**
   * GET /blocks
   * Retrieves the list of blocked users for the logged-in user.
   */
  @Get()
  async getBlockedUsers(
    @Req() req: Request,
    @Query() query: GetBlocksQueryDto,
  ) {
    const blockerId = req.user!.userId;
    const data = await this.blocksService.getBlockedUsers(blockerId, query);
    return successResponse(data, 'Blocked users retrieved successfully');
  }

  /**
   * DELETE /blocks/:userId
   * Unblocks a target user.
   */
  @Delete(':userId')
  async unblockUser(
    @Req() req: Request,
    @Param('userId') blockedUserId: string,
  ) {
    const blockerId = req.user!.userId;
    const data = await this.blocksService.unblockUser(blockerId, blockedUserId);
    return successResponse(data, 'User unblocked successfully');
  }
}
