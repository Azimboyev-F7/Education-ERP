import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AssignmentQuery, CreateAssignmentRequest } from '@erp/contracts';
import type { Principal } from '../access/principal.js';
import { CurrentUser, StaffOnly } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AssignmentsService } from './assignments.service.js';

@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @StaffOnly()
  @Get('assignments')
  list(@CurrentUser() user: Principal, @Query(new ZodPipe(AssignmentQuery)) query: AssignmentQuery) {
    return this.assignments.list(user, query);
  }

  @StaffOnly()
  @Post('assignments')
  create(@CurrentUser() user: Principal, @Body(new ZodPipe(CreateAssignmentRequest)) body: CreateAssignmentRequest) {
    return this.assignments.create(user, body);
  }

  @StaffOnly()
  @Get('assignments/:id')
  get(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.assignments.get(user, id);
  }

  @StaffOnly()
  @Post('assignments/:id/recipients/:studentId/excuse')
  @HttpCode(HttpStatus.NO_CONTENT)
  excuse(@CurrentUser() user: Principal, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.assignments.excuse(user, id, studentId);
  }

  @StaffOnly()
  @Post('assignments/:id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.assignments.cancel(user, id);
  }

  /** The signed-in student's own assignments. */
  @Get('my/assignments')
  mine(@CurrentUser() user: Principal) {
    return this.assignments.mine(user);
  }
}
