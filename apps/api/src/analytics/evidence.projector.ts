import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ATTEMPT_SUBMITTED } from '../attempts/attempts.service.js';
import type { EvidenceKind, Skill } from '../generated/prisma/client.js';
import { type EventPayload, OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REVIEW_COMPLETED } from '../reviews/reviews.service.js';

const BAND_MAX = 9;

/**
 * Turns scored work into rows of the evidence fact table.
 *
 * Runs from the outbox, so it may be delivered more than once: every write is an upsert
 * on (attempt, skill, task type, kind) and recomputes the row from the source data.
 */
@Injectable()
export class EvidenceProjector implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  onModuleInit(): void {
    this.outbox.on(ATTEMPT_SUBMITTED, (payload) => this.onAttemptSubmitted(payload));
    this.outbox.on(REVIEW_COMPLETED, (payload) => this.onReviewCompleted(payload));
  }

  /** One AUTO_SCORED row per skill and question type answered in the attempt. */
  private async onAttemptSubmitted(payload: EventPayload): Promise<void> {
    const attempt = await this.loadAttempt(String(payload.attemptId));
    if (!attempt) return;
    const responses = await this.prisma.response.findMany({
      where: { attemptId: attempt.id, isCorrect: { not: null } },
      select: {
        score: true,
        maxScore: true,
        question: { select: { group: { select: { type: true, section: { select: { skill: true } } } } } },
      },
    });

    const totals = new Map<string, { skill: Skill; taskType: string; score: number; maxScore: number }>();
    for (const r of responses) {
      const { type, section } = r.question.group;
      const key = `${section.skill}|${type}`;
      const total = totals.get(key) ?? { skill: section.skill, taskType: type, score: 0, maxScore: 0 };
      total.score += r.score ?? 0;
      total.maxScore += r.maxScore;
      totals.set(key, total);
    }
    for (const total of totals.values()) {
      await this.upsert(attempt, 'AUTO_SCORED', total.skill, total.taskType, total.score, total.maxScore, null);
    }
  }

  /** One TEACHER_ASSESSED row per skill and task (e.g. Writing Task 2) reviewed in the attempt. */
  private async onReviewCompleted(payload: EventPayload): Promise<void> {
    const review = await this.prisma.reviewTask.findUnique({ where: { id: String(payload.reviewId) } });
    if (!review) return;
    const attempt = await this.loadAttempt(review.attemptId);
    if (!attempt) return;

    // Recomputed from every finished review of the same task in this attempt.
    const done = await this.prisma.reviewTask.findMany({
      where: { attemptId: review.attemptId, skill: review.skill, taskType: review.taskType, status: 'DONE' },
      select: { overallBand: true },
    });
    const bands = done.flatMap((r) => (r.overallBand === null ? [] : [r.overallBand]));
    if (bands.length === 0) return;
    const band = bands.reduce((sum, b) => sum + b, 0) / bands.length;
    await this.upsert(attempt, 'TEACHER_ASSESSED', review.skill, review.taskType, band, BAND_MAX, band);
  }

  private loadAttempt(id: string) {
    return this.prisma.attempt.findUnique({
      where: { id },
      select: {
        id: true,
        centerId: true,
        studentId: true,
        versionId: true,
        source: true,
        timed: true,
        submittedAt: true,
        recipient: { select: { assignment: { select: { groupId: true } } } },
      },
    });
  }

  private async upsert(
    attempt: NonNullable<Awaited<ReturnType<EvidenceProjector['loadAttempt']>>>,
    kind: EvidenceKind,
    skill: Skill,
    taskType: string,
    score: number,
    maxScore: number,
    band: number | null,
  ): Promise<void> {
    // Group at the time of the work: the assignment's group, else the student's current group.
    const groupId =
      attempt.recipient?.assignment.groupId ??
      (
        await this.prisma.enrollment.findFirst({
          where: { studentId: attempt.studentId, endedOn: null },
          orderBy: { startedOn: 'desc' },
          select: { groupId: true },
        })
      )?.groupId ??
      null;

    const values = { score, maxScore, band };
    await this.prisma.skillEvidence.upsert({
      where: { attemptId_skill_taskType_kind: { attemptId: attempt.id, skill, taskType, kind } },
      create: {
        centerId: attempt.centerId,
        studentId: attempt.studentId,
        groupId,
        skill,
        taskType,
        kind,
        source: attempt.source,
        timed: attempt.timed,
        occurredAt: attempt.submittedAt ?? new Date(),
        attemptId: attempt.id,
        versionId: attempt.versionId,
        ...values,
      },
      update: values,
    });
  }
}
