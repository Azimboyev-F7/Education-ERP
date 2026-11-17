import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import {
  CreateStaffRequest,
  CreateStudentRequest,
  EnrolRequest,
  SetRolesRequest,
  TransferRequest,
  UpdateStaffRequest,
  UpdateStudentRequest,
} from '@erp/contracts';
import type { Principal } from '../access/principal.js';
import { CurrentUser, StaffOnly } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AccountsService } from './accounts.service.js';
import { EnrolmentService } from './enrolment.service.js';

/** Responses that carry a one-time password must never be cached by a browser or proxy. */
const NO_STORE = ['Cache-Control', 'no-store'] as const;

@StaffOnly()
@Controller()
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly enrolment: EnrolmentService,
  ) {}

  // ───────────── staff ─────────────

  @Get('staff')
  listStaff(@CurrentUser() user: Principal) {
    return this.accounts.listStaff(user);
  }

  @Post('staff')
  @Header(...NO_STORE)
  createStaff(@CurrentUser() user: Principal, @Body(new ZodPipe(CreateStaffRequest)) body: CreateStaffRequest) {
    return this.accounts.createStaff(user, body);
  }

  @Patch('staff/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateStaff(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateStaffRequest)) body: UpdateStaffRequest,
  ) {
    return this.accounts.updateStaff(user, id, body);
  }

  @Put('staff/:id/roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  setRoles(@CurrentUser() user: Principal, @Param('id') id: string, @Body(new ZodPipe(SetRolesRequest)) body: SetRolesRequest) {
    return this.accounts.setRoles(user, id, body);
  }

  // ───────────── students ─────────────

  @Post('students')
  @Header(...NO_STORE)
  createStudent(@CurrentUser() user: Principal, @Body(new ZodPipe(CreateStudentRequest)) body: CreateStudentRequest) {
    return this.accounts.createStudent(user, body);
  }

  @Get('students/:id')
  student(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.accounts.student(user, id);
  }

  @Patch('students/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateStudent(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateStudentRequest)) body: UpdateStudentRequest,
  ) {
    return this.accounts.updateStudent(user, id, body);
  }

  @Post('students/:id/transfer')
  @HttpCode(HttpStatus.NO_CONTENT)
  transfer(@CurrentUser() user: Principal, @Param('id') id: string, @Body(new ZodPipe(TransferRequest)) body: TransferRequest) {
    return this.enrolment.transfer(user, id, body.fromGroupId, body.toGroupId);
  }

  // ───────────── enrolment ─────────────

  @Post('groups/:id/students')
  @HttpCode(HttpStatus.NO_CONTENT)
  enrol(@CurrentUser() user: Principal, @Param('id') id: string, @Body(new ZodPipe(EnrolRequest)) body: EnrolRequest) {
    return this.enrolment.enrol(user, id, body.studentId);
  }

  @Post('groups/:id/students/:studentId/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  unenrol(@CurrentUser() user: Principal, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.enrolment.unenrol(user, id, studentId);
  }

  // ───────────── account lifecycle ─────────────

  @Post('users/:id/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.accounts.setStatus(user, id, 'DISABLED');
  }

  @Post('users/:id/enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  enable(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.accounts.setStatus(user, id, 'ACTIVE');
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Header(...NO_STORE)
  resetPassword(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.accounts.resetPassword(user, id);
  }
}
