import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import {
  type BranchSummary,
  CreateBranchRequest,
  CreateCourseRequest,
  CreateGroupRequest,
  CreateLevelRequest,
  CreatePeriodRequest,
  GroupTeacherRequest,
  type GroupSummary,
  type StudentSummary,
  UpdateGroupRequest,
} from '@erp/contracts';
import type { Principal } from '../access/principal.js';
import { CurrentUser, StaffOnly } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { OrgService } from './org.service.js';

@StaffOnly()
@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  // ───────────── reading ─────────────

  @Get('branches')
  branches(@CurrentUser() user: Principal): Promise<BranchSummary[]> {
    return this.org.branches(user);
  }

  @Get('courses')
  courses(@CurrentUser() user: Principal) {
    return this.org.courses(user);
  }

  @Get('periods')
  periods(@CurrentUser() user: Principal) {
    return this.org.periods(user);
  }

  @Get('groups')
  groups(@CurrentUser() user: Principal): Promise<GroupSummary[]> {
    return this.org.groups(user);
  }

  @Get('groups/:id')
  group(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.org.group(user, id);
  }

  @Get('students')
  students(@CurrentUser() user: Principal): Promise<StudentSummary[]> {
    return this.org.students(user);
  }

  // ───────────── centre structure ─────────────

  @Post('branches')
  createBranch(@CurrentUser() user: Principal, @Body(new ZodPipe(CreateBranchRequest)) body: CreateBranchRequest) {
    return this.org.createBranch(user, body);
  }

  @Post('courses')
  createCourse(@CurrentUser() user: Principal, @Body(new ZodPipe(CreateCourseRequest)) body: CreateCourseRequest) {
    return this.org.createCourse(user, body);
  }

  @Post('courses/:id/levels')
  createLevel(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(CreateLevelRequest)) body: CreateLevelRequest,
  ) {
    return this.org.createLevel(user, id, body);
  }

  @Post('periods')
  createPeriod(@CurrentUser() user: Principal, @Body(new ZodPipe(CreatePeriodRequest)) body: CreatePeriodRequest) {
    return this.org.createPeriod(user, body);
  }

  // ───────────── groups ─────────────

  @Post('groups')
  createGroup(
    @CurrentUser() user: Principal,
    @Body(new ZodPipe(CreateGroupRequest)) body: CreateGroupRequest,
  ): Promise<{ id: string }> {
    return this.org.createGroup(user, body);
  }

  @Patch('groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateGroup(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateGroupRequest)) body: UpdateGroupRequest,
  ) {
    return this.org.updateGroup(user, id, body);
  }

  @Post('groups/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  archiveGroup(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.org.archiveGroup(user, id);
  }

  @Put('groups/:id/teachers')
  @HttpCode(HttpStatus.NO_CONTENT)
  addTeacher(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(GroupTeacherRequest)) body: GroupTeacherRequest,
  ) {
    return this.org.addTeacher(user, id, body.userId);
  }

  @Delete('groups/:id/teachers/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeacher(@CurrentUser() user: Principal, @Param('id') id: string, @Param('userId') userId: string) {
    return this.org.removeTeacher(user, id, userId);
  }
}
