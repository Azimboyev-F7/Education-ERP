import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReviewQuery, ScoreReviewRequest } from '@erp/contracts';
import type { Principal } from '../access/principal.js';
import { CurrentUser, StaffOnly } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ReviewsService } from './reviews.service.js';

@StaffOnly()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  queue(@CurrentUser() user: Principal, @Query(new ZodPipe(ReviewQuery)) query: ReviewQuery) {
    return this.reviews.queue(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.reviews.get(user, id);
  }

  @Post(':id/score')
  score(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(ScoreReviewRequest)) body: ScoreReviewRequest,
  ) {
    return this.reviews.score(user, id, body);
  }
}
