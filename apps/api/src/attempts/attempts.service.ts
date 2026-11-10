import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CURRENT_RUBRIC, type PracticeQuery, type SaveResponsesRequest, type StartAttemptRequest } from '@erp/contracts';
import { estimateBand, FULL_TEST_QUESTIONS, parseResponse, scoreResponse } from '@erp/scoring';
import { isStaff } from '../access/access.policy.js';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../access/principal.js';
import { flattenQuestions, toStudentView, versionTree } from '../content/content.tree.js';
import type { Prisma } from '../generated/prisma/client.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Allowance for network delay between the student's last keystroke and the server. */
const GRACE_MS = 15_000;
/** Teacher-marked responses are judged on the IELTS band scale. */
const BAND_MAX = 9;
const SKIPPED = { skipped: true } as const;

export const ATTEMPT_SUBMITTED = 'attempt.submitted';

const deadlinePassed = (deadlineAt: Date | null, now = Date.now()) =>
  deadlineAt !== null && now > deadlineAt.getTime() + GRACE_MS;

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly outbox: OutboxService,
  ) {}

  /** Starts (or resumes) an attempt. Idempotent: an attempt already in progress is returned as is. */
  async start(user: Principal, input: StartAttemptRequest): Promise<{ id: string; resumed: boolean }> {
    this.access.requireStudent(user);
    return 'recipientId' in input
      ? this.startAssigned(user, input.recipientId)
      : this.startPractice(user, input.versionId, input.timed);
  }

  private startAssigned(user: Principal, recipientId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Serialise concurrent starts for the same student and assignment.
      await tx.$queryRaw`SELECT 1 FROM "AssignmentRecipient" WHERE "id" = ${recipientId} FOR UPDATE`;
      const recipient = await tx.assignmentRecipient.findFirst({
        where: { id: recipientId, studentId: user.userId, assignment: { cancelledAt: null } },
        include: {
          assignment: { include: { version: { select: { timeLimitSec: true } } } },
          attempts: { select: { id: true, status: true } },
        },
      });
      if (!recipient) throw new NotFoundException('Assignment not found');

      const open = recipient.attempts.find((a) => a.status === 'IN_PROGRESS');
      if (open) return { id: open.id, resumed: true };

      const { assignment } = recipient;
      if (recipient.status === 'EXCUSED') throw new ConflictException('You have been excused from this assignment');
      if (assignment.opensAt && assignment.opensAt > new Date()) throw new ConflictException('This assignment is not open yet');
      if (recipient.attempts.length >= assignment.maxAttempts) throw new ConflictException('No attempts left');

      const limit = assignment.timeLimitSec ?? assignment.version.timeLimitSec;
      const attempt = await tx.attempt.create({
        data: {
          centerId: user.centerId,
          studentId: user.userId,
          versionId: assignment.versionId,
          source: 'ASSIGNMENT',
          recipientId,
          timed: limit !== null,
          deadlineAt: limit === null ? null : new Date(Date.now() + limit * 1000),
        },
        select: { id: true },
      });
      await tx.assignmentRecipient.update({ where: { id: recipientId }, data: { status: 'STARTED', completedAt: null } });
      return { id: attempt.id, resumed: false };
    });
  }

  private async startPractice(user: Principal, versionId: string, timed: boolean) {
    const version = await this.prisma.taskSetVersion.findFirst({
      where: { id: versionId, status: 'PUBLISHED', taskSet: { centerId: user.centerId, archivedAt: null } },
      select: { id: true, timeLimitSec: true },
    });
    if (!version) throw new NotFoundException('Task set not found');

    const open = await this.prisma.attempt.findFirst({
      where: { studentId: user.userId, versionId, source: 'SELF_PRACTICE', status: 'IN_PROGRESS' },
      select: { id: true },
    });
    if (open) return { id: open.id, resumed: true };

    const limit = timed ? version.timeLimitSec : null;
    const attempt = await this.prisma.attempt.create({
      data: {
        centerId: user.centerId,
        studentId: user.userId,
        versionId,
        source: 'SELF_PRACTICE',
        timed: limit !== null,
        deadlineAt: limit === null ? null : new Date(Date.now() + limit * 1000),
      },
      select: { id: true },
    });
    return { id: attempt.id, resumed: false };
  }

  /**
   * The attempt as its student (or a teacher who may see that student) should see it.
   * Answer keys, explanations and marks appear only once the attempt has been submitted.
   */
  async get(user: Principal, id: string) {
    let attempt = await this.prisma.attempt.findFirst({ where: { id, centerId: user.centerId } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    const own = attempt.studentId === user.userId;
    if (!own) {
      if (!isStaff(user)) throw new NotFoundException('Attempt not found');
      await this.access.requireStudentVisible(user, attempt.studentId);
    }

    // The timer is enforced lazily: the first read after the deadline closes the attempt.
    if (attempt.status === 'IN_PROGRESS' && deadlinePassed(attempt.deadlineAt)) {
      await this.finalize(id);
      attempt = await this.prisma.attempt.findUniqueOrThrow({ where: { id } });
    }

    const [tree, responses] = await Promise.all([
      this.prisma.taskSetVersion.findUniqueOrThrow({ where: { id: attempt.versionId }, include: versionTree }),
      this.prisma.response.findMany({ where: { attemptId: id }, include: { review: true } }),
    ]);
    const reveal = attempt.status !== 'IN_PROGRESS' || !own;

    return {
      id: attempt.id,
      studentId: attempt.studentId,
      status: attempt.status,
      source: attempt.source,
      timed: attempt.timed,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      /** Clients count down against this, not their own clock. */
      serverNow: new Date(),
      ...(reveal
        ? { score: attempt.score, maxScore: attempt.maxScore, bandEstimate: attempt.bandEstimate, bandIsEstimate: true }
        : {}),
      content: toStudentView(tree, reveal),
      responses: responses
        .filter((r) => !isSkipped(r.answer))
        .map((r) => ({
          questionId: r.questionId,
          answer: r.answer,
          timeSpentMs: r.timeSpentMs,
          ...(reveal
            ? {
                isCorrect: r.isCorrect,
                score: r.score,
                maxScore: r.maxScore,
                review: !r.review
                  ? null
                  : r.review.status === 'PENDING'
                    ? { status: r.review.status }
                    : {
                        status: r.review.status,
                        rubricKey: r.review.rubricKey,
                        criteria: r.review.criteria,
                        overallBand: r.review.overallBand,
                        comment: r.review.comment,
                        nextStep: r.review.nextStep,
                      },
              }
            : {}),
        })),
    };
  }

  /** Autosave. Rejected once the attempt is submitted or its time is up. */
  async save(user: Principal, id: string, input: SaveResponsesRequest) {
    const attempt = await this.prisma.attempt.findFirst({ where: { id, studentId: user.userId } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status !== 'IN_PROGRESS') throw new ConflictException('This attempt has already been submitted');
    if (deadlinePassed(attempt.deadlineAt)) throw new ConflictException('Time is up');

    const tree = await this.prisma.taskSetVersion.findUniqueOrThrow({ where: { id: attempt.versionId }, include: versionTree });
    const questions = new Map(flattenQuestions(tree).map((q) => [q.question.id, q]));

    const rows = input.responses.map((response, index) => {
      const question = questions.get(response.questionId);
      const parsed = question ? parseResponse(question.type, response.answer) : null;
      if (!question || !parsed?.ok) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: [{ path: `responses.${index}`, message: !question ? 'Unknown question' : parsed && !parsed.ok ? parsed.problem : 'invalid' }],
        });
      }
      return {
        questionId: response.questionId,
        answer: parsed.value as Prisma.InputJsonValue,
        maxScore: question.manual ? BAND_MAX : question.question.points,
        timeSpentMs: response.timeSpentMs,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.response.upsert({
          where: { attemptId_questionId: { attemptId: id, questionId: row.questionId } },
          create: { attemptId: id, ...row, timeSpentMs: row.timeSpentMs ?? 0 },
          update: {
            answer: row.answer,
            changeCount: { increment: 1 },
            ...(row.timeSpentMs === undefined ? {} : { timeSpentMs: row.timeSpentMs }),
          },
        });
      }
    });
    return { saved: rows.length, serverNow: new Date(), deadlineAt: attempt.deadlineAt };
  }

  /** Idempotent: submitting twice returns the same result and scores once. */
  async submit(user: Principal, id: string) {
    const attempt = await this.prisma.attempt.findFirst({ where: { id, studentId: user.userId }, select: { id: true } });
    if (!attempt) throw new NotFoundException('Attempt not found');
    await this.finalize(id);
    return this.get(user, id);
  }

  async mine(user: Principal) {
    this.access.requireStudent(user);
    const attempts = await this.prisma.attempt.findMany({
      where: { studentId: user.userId },
      include: { version: { select: { taskSet: { select: { title: true, skill: true } } } } },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    return attempts.map((a) => ({
      id: a.id,
      title: a.version.taskSet.title,
      skill: a.version.taskSet.skill,
      source: a.source,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      score: a.status === 'IN_PROGRESS' ? null : a.score,
      maxScore: a.status === 'IN_PROGRESS' ? null : a.maxScore,
    }));
  }

  /** Published task sets a student may practise on their own. */
  async practiceCatalog(user: Principal, query: PracticeQuery) {
    this.access.requireStudent(user);
    const versions = await this.prisma.taskSetVersion.findMany({
      where: {
        status: 'PUBLISHED',
        taskSet: { centerId: user.centerId, archivedAt: null, ...(query.skill ? { skill: query.skill } : {}) },
      },
      select: {
        id: true,
        difficulty: true,
        timeLimitSec: true,
        fullLength: true,
        tags: true,
        taskSet: { select: { title: true, skill: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });
    return versions.map((v) => ({
      versionId: v.id,
      title: v.taskSet.title,
      skill: v.taskSet.skill,
      difficulty: v.difficulty,
      timeLimitSec: v.timeLimitSec,
      fullLength: v.fullLength,
      tags: v.tags,
    }));
  }

  /**
   * Closes an attempt: scores every auto-marked question, queues teacher-marked responses
   * for review, updates the assignment status and emits `attempt.submitted` — all in one
   * transaction. Safe to call more than once; only the first call does anything.
   */
  private async finalize(id: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        // Claim the attempt. A concurrent call blocks on this row and then matches nothing.
        const claimed = await tx.attempt.updateMany({
          where: { id, status: 'IN_PROGRESS' },
          data: { status: 'COMPLETED', submittedAt: now },
        });
        if (claimed.count === 0) return;

        const attempt = await tx.attempt.findUniqueOrThrow({
          where: { id },
          include: { version: { include: versionTree }, responses: true },
        });
        const questions = flattenQuestions(attempt.version);
        const responses = new Map(attempt.responses.map((r) => [r.questionId, r]));

        let score = 0;
        let maxScore = 0;
        let reviews = 0;
        for (const q of questions) {
          const response = responses.get(q.question.id);
          if (q.manual) {
            const rubricKey = CURRENT_RUBRIC[q.skill];
            if (!response || !rubricKey) continue;
            await tx.reviewTask.create({
              data: {
                centerId: attempt.centerId,
                attemptId: id,
                responseId: response.id,
                studentId: attempt.studentId,
                skill: q.skill,
                taskType: q.sectionKind,
                rubricKey,
              },
            });
            reviews++;
            continue;
          }

          const points = q.question.points;
          const result = response
            ? scoreResponse(q.type, q.config, q.question.answerKey, response.answer, points)
            : { isCorrect: false, score: 0 };
          score += result.score;
          maxScore += points;
          if (response) {
            await tx.response.update({ where: { id: response.id }, data: { ...result, maxScore: points } });
          } else {
            // Unanswered questions are recorded as wrong so question-level reports add up.
            await tx.response.create({
              data: { attemptId: id, questionId: q.question.id, answer: SKIPPED, ...result, maxScore: points },
            });
          }
        }

        const first = questions[0];
        const bandEstimate =
          attempt.version.fullLength && attempt.timed && maxScore === FULL_TEST_QUESTIONS && first &&
          (first.skill === 'LISTENING' || first.skill === 'READING')
            ? estimateBand(first.skill, attempt.version.module ?? 'ACADEMIC', score)
            : null;

        const status = reviews > 0 ? 'AWAITING_REVIEW' : 'COMPLETED';
        await tx.attempt.update({
          where: { id },
          data: { status, score: maxScore > 0 ? score : null, maxScore: maxScore > 0 ? maxScore : null, bandEstimate },
        });
        if (attempt.recipientId) {
          await tx.assignmentRecipient.updateMany({
            where: { id: attempt.recipientId, status: { not: 'EXCUSED' } },
            data: { status, completedAt: status === 'COMPLETED' ? now : null },
          });
        }
        await this.outbox.publish(tx, ATTEMPT_SUBMITTED, { attemptId: id });
      },
      { timeout: 30_000 },
    );
  }
}

function isSkipped(answer: unknown): boolean {
  return typeof answer === 'object' && answer !== null && (answer as { skipped?: unknown }).skipped === true;
}
