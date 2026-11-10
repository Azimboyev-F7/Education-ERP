import { Controller, Get, Param } from '@nestjs/common';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../access/principal.js';
import { CurrentUser, StaffOnly } from '../auth/decorators.js';
import { AnalyticsService } from './analytics.service.js';

@Controller()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly access: AccessService,
  ) {}

  @StaffOnly()
  @Get('analytics/students/:id')
  student(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.analytics.student(user, id);
  }

  @StaffOnly()
  @Get('analytics/groups/:id')
  group(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.analytics.group(user, id);
  }

  @StaffOnly()
  @Get('assignments/:id/report')
  assignment(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.analytics.assignment(user, id);
  }

  /** The signed-in student's own progress. */
  @Get('my/progress')
  mine(@CurrentUser() user: Principal) {
    this.access.requireStudent(user);
    return this.analytics.student(user, user.userId);
  }
}
