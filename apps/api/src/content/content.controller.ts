import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { CreateTaskSetRequest, TaskSetQuery, VersionContentInput } from '@erp/contracts';
import type { Principal } from '../access/principal.js';
import { CurrentUser, StaffOnly } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ContentService } from './content.service.js';

@StaffOnly()
@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('task-sets')
  list(@CurrentUser() user: Principal, @Query(new ZodPipe(TaskSetQuery)) query: TaskSetQuery) {
    return this.content.list(user, query);
  }

  @Post('task-sets')
  create(@CurrentUser() user: Principal, @Body(new ZodPipe(CreateTaskSetRequest)) body: CreateTaskSetRequest) {
    return this.content.create(user, body);
  }

  @Post('task-sets/:id/versions')
  newVersion(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.content.newVersion(user, id);
  }

  @Get('task-set-versions/:id')
  getVersion(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.content.getVersion(user, id);
  }

  @Put('task-set-versions/:id/content')
  saveContent(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(VersionContentInput)) body: VersionContentInput,
  ) {
    return this.content.saveContent(user, id, body);
  }

  @Post('task-set-versions/:id/submit')
  @HttpCode(HttpStatus.NO_CONTENT)
  submit(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.content.submitForReview(user, id);
  }

  @Post('task-set-versions/:id/return')
  @HttpCode(HttpStatus.NO_CONTENT)
  returnToDraft(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.content.returnToDraft(user, id);
  }

  @Post('task-set-versions/:id/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  publish(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.content.publish(user, id);
  }

  @Post('task-set-versions/:id/retire')
  @HttpCode(HttpStatus.NO_CONTENT)
  retire(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.content.retire(user, id);
  }
}
