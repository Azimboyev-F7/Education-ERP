import { Module } from '@nestjs/common';
import { AccessModule } from './access/access.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AssignmentsModule } from './assignments/assignments.module.js';
import { AttemptsModule } from './attempts/attempts.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ContentModule } from './content/content.module.js';
import { HealthController } from './health.controller.js';
import { OrgModule } from './org/org.module.js';
import { OutboxModule } from './outbox/outbox.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AccessModule,
    OutboxModule,
    AuthModule,
    OrgModule,
    AccountsModule,
    ContentModule,
    AssignmentsModule,
    AttemptsModule,
    ReviewsModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
