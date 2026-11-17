import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { EnrolmentService } from './enrolment.service.js';

@Module({ controllers: [AccountsController], providers: [AccountsService, EnrolmentService] })
export class AccountsModule {}
