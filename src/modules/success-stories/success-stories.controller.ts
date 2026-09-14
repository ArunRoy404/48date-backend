import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { successResponse } from '../../common/response/api-response.util.js';
import { SuccessStoriesService } from './success-stories.service.js';
import { CreateSuccessStoryDto } from './dto/create-success-story.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { GetSuccessStoriesQueryDto } from './dto/get-success-stories-query.dto.js';

@Controller('success-stories')
export class SuccessStoriesController {
  constructor(private readonly successStoriesService: SuccessStoriesService) {}

  /**
   * POST /success-stories
   * Submits a success story for moderation approval.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createStory(@Req() req: Request, @Body() dto: CreateSuccessStoryDto) {
    const authorId = req.user!.userId;
    const data = await this.successStoriesService.createStory(authorId, dto);
    return successResponse(data, 'Success story submitted successfully');
  }

  /**
   * GET /success-stories
   * Lists published success stories.
   */
  @Get()
  async getStories(
    @Req() req: Request,
    @Query() query: GetSuccessStoriesQueryDto,
  ) {
    const currentUserId = req.user?.userId;
    const data = await this.successStoriesService.getStories(
      currentUserId,
      query,
    );
    return successResponse(data, 'Success stories retrieved successfully');
  }

  /**
   * GET /success-stories/:id
   * Retrieves full details and comments of a single success story.
   */
  @Get(':id')
  async getStoryById(@Req() req: Request, @Param('id') storyId: string) {
    const currentUserId = req.user?.userId;
    const data = await this.successStoriesService.getStoryById(
      storyId,
      currentUserId,
    );
    return successResponse(data, 'Success story retrieved successfully');
  }

  /**
   * POST /success-stories/:id/like
   * Likes or unlikes a published success story.
   */
  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async toggleLike(@Req() req: Request, @Param('id') storyId: string) {
    const userId = req.user!.userId;
    const data = await this.successStoriesService.toggleLike(storyId, userId);
    return successResponse(
      data,
      data.isLiked ? 'Story liked successfully' : 'Story unliked successfully',
    );
  }

  /**
   * POST /success-stories/:id/comments
   * Adds a comment to a published success story.
   */
  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  async addComment(
    @Req() req: Request,
    @Param('id') storyId: string,
    @Body() dto: CreateCommentDto,
  ) {
    const userId = req.user!.userId;
    const data = await this.successStoriesService.addComment(
      storyId,
      userId,
      dto,
    );
    return successResponse(data, 'Comment added successfully');
  }

  /**
   * DELETE /success-stories/:id/comments/:commentId
   * Deletes a comment from a success story.
   */
  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  async deleteComment(
    @Req() req: Request,
    @Param('id') storyId: string,
    @Param('commentId') commentId: string,
  ) {
    const userId = req.user!.userId;
    const data = await this.successStoriesService.deleteComment(
      storyId,
      commentId,
      userId,
    );
    return successResponse(data, 'Comment deleted successfully');
  }
}
