import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { EvidenceProjector } from './evidence.projector.js';

@Module({
  imports: [AssignmentsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, EvidenceProjector],
})
export class AnalyticsModule {}
