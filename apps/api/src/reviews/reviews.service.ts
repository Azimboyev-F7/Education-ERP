import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type ReviewQuery, type Rubric, RUBRICS, type ScoreReviewRequest } from '@erp/contracts';
import { overallBand } from '@erp/scoring';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const REVIEW_COMPLETED = 'review.completed';

const rubricFor = (key: string): Rubric | null =>
  Object.hasOwn(RUBRICS, key) ? RUBRICS[key as keyof typeof RUBRICS] : null;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /** Writing and Speaking responses waiting for a teacher, oldest first. */
  async queue(user: Principal, query: ReviewQuery) {
    const studentId = await this.access.studentIdFilter(user);
    const tasks = await this.prisma.reviewTask.findMany({
      where: { centerId: user.centerId, status: query.status, ...(studentId ? { studentId } : {}) },
      orderBy: query.status === 'PENDING' ? { createdAt: 'asc' } : { completedAt: 'desc' },
      take: 200,
    });
    const students = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(tasks.map((t) => t.studentId))] } },
      select: { id: true, fullName: true },
    });
    const names = new Map(students.map((s) => [s.id, s.fullName]));
    const now = Date.now();
    return tasks.map((t) => ({
      id: t.id,
      student: { id: t.studentId, fullName: names.get(t.studentId) ?? '' },
      skill: t.skill,
      taskType: t.taskType,
      status: t.status,
      createdAt: t.createdAt,
      /** How long the student has been waiting for feedback. */
      waitingHours: Math.floor(((t.completedAt?.getTime() ?? now) - t.createdAt.getTime()) / 3_600_000),
      overallBand: t.overallBand,
    }));
  }

  async get(user: Principal, id: string) {
    const task = await this.find(user, id);
    const response = await this.prisma.response.findUniqueOrThrow({
      where: { id: task.responseId },
      include: { question: { include: { group: { include: { section: true, stimulus: true } } } } },
    });
    const { group } = response.question;
    return {
      id: task.id,
      attemptId: task.attemptId,
      studentId: task.studentId,
      skill: task.skill,
      taskType: task.taskType,
      status: task.status,
      createdAt: task.createdAt,
      rubricKey: task.rubricKey,
      rubric: rubricFor(task.rubricKey),
      prompt: response.question.prompt,
      stimulus: group.stimulus ? { kind: group.stimulus.kind, text: group.stimulus.text, fileKey: group.stimulus.fileKey } : null,
      answer: response.answer,
      timeSpentMs: response.timeSpentMs,
      result:
        task.status === 'DONE'
          ? {
              criteria: task.criteria,
              overallBand: task.overallBand,
              comment: task.comment,
              nextStep: task.nextStep,
              reviewerId: task.reviewerId,
              completedAt: task.completedAt,
            }
          : null,
    };
  }

  /**
   * Records the teacher's rubric judgment. When it is the last open review of an attempt,
   * the attempt and its assignment status become COMPLETED in the same transaction.
   */
  async score(user: Principal, id: string, input: ScoreReviewRequest): Promise<{ overallBand: number }> {
    const task = await this.find(user, id);
    const rubric = rubricFor(task.rubricKey);
    if (!rubric) throw new ConflictException(`Unknown rubric ${task.rubricKey}`);

    const expected = rubric.criteria.map((c) => c.key);
    const given = Object.keys(input.criteria);
    if (given.length !== expected.length || expected.some((key) => input.criteria[key] === undefined)) {
      throw new BadRequestException(`Give exactly one band for each of: ${expected.join(', ')}`);
    }
    const overall = overallBand(expected.map((key) => input.criteria[key]!));

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.reviewTask.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'DONE',
          completedAt: now,
          reviewerId: user.userId,
          criteria: input.criteria,
          overallBand: overall,
          comment: input.comment,
          nextStep: input.nextStep,
        },
      });
      if (claimed.count === 0) throw new ConflictException('This response has already been reviewed');

      await tx.response.update({ where: { id: task.responseId }, data: { score: overall } });

      const stillOpen = await tx.reviewTask.count({ where: { attemptId: task.attemptId, status: 'PENDING' } });
      if (stillOpen === 0) {
        const attempt = await tx.attempt.update({
          where: { id: task.attemptId },
          data: { status: 'COMPLETED' },
          select: { recipientId: true },
        });
        if (attempt.recipientId) {
          await tx.assignmentRecipient.updateMany({
            where: { id: attempt.recipientId, status: 'AWAITING_REVIEW' },
            data: { status: 'COMPLETED', completedAt: now },
          });
        }
      }
      await this.outbox.publish(tx, REVIEW_COMPLETED, { reviewId: id });
    });

    await this.audit.record({
      action: 'review.score',
      actorId: user.userId,
      centerId: user.centerId,
      entityType: 'ReviewTask',
      entityId: id,
      data: { overallBand: overall, studentId: task.studentId },
    });
    return { overallBand: overall };
  }

  private async find(user: Principal, id: string) {
    const task = await this.prisma.reviewTask.findFirst({ where: { id, centerId: user.centerId } });
    if (!task) throw new NotFoundException('Review not found');
    await this.access.requireStudentVisible(user, task.studentId).catch(() => {
      throw new NotFoundException('Review not found');
    });
    return task;
  }
}
