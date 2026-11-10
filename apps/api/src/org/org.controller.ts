import { Body, Controller, Get, Post } from '@nestjs/common';
import { type BranchSummary, CreateGroupRequest, type GroupSummary, type StudentSummary } from '@erp/contracts';
import type { Principal } from '../access/principal.js';
import { CurrentUser, StaffOnly } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { OrgService } from './org.service.js';

@StaffOnly()
@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('branches')
  branches(@CurrentUser() user: Principal): Promise<BranchSummary[]> {
    return this.org.branches(user);
  }

  @Get('groups')
  groups(@CurrentUser() user: Principal): Promise<GroupSummary[]> {
    return this.org.groups(user);
  }

  @Post('groups')
  createGroup(
    @CurrentUser() user: Principal,
    @Body(new ZodPipe(CreateGroupRequest)) body: CreateGroupRequest,
  ): Promise<{ id: string }> {
    return this.org.createGroup(user, body);
  }

  @Get('students')
  students(@CurrentUser() user: Principal): Promise<StudentSummary[]> {
    return this.org.students(user);
  }
}
