import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { PracticeQuery, SaveResponsesRequest, StartAttemptRequest } from '@erp/contracts';
import type { Principal } from '../access/principal.js';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AttemptsService } from './attempts.service.js';

@Controller()
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post('attempts')
  start(@CurrentUser() user: Principal, @Body(new ZodPipe(StartAttemptRequest)) body: StartAttemptRequest) {
    return this.attempts.start(user, body);
  }

  @Get('attempts/:id')
  get(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.attempts.get(user, id);
  }

  @Put('attempts/:id/responses')
  save(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(SaveResponsesRequest)) body: SaveResponsesRequest,
  ) {
    return this.attempts.save(user, id, body);
  }

  @Post('attempts/:id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.attempts.submit(user, id);
  }

  @Get('my/attempts')
  mine(@CurrentUser() user: Principal) {
    return this.attempts.mine(user);
  }

  @Get('practice/task-sets')
  practice(@CurrentUser() user: Principal, @Query(new ZodPipe(PracticeQuery)) query: PracticeQuery) {
    return this.attempts.practiceCatalog(user, query);
  }
}
