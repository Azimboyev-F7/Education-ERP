import { Injectable } from '@nestjs/common';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../access/principal.js';
import { AssignmentsService, isOverdue } from '../assignments/assignments.service.js';
import { flattenQuestions, versionTree } from '../content/content.tree.js';
import type { RecipientStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { summarise } from './summarise.js';

const EVIDENCE_LIMIT = 5000;

interface Completion {
  assigned: number;
  completed: number;
  awaitingReview: number;
  open: number;
  overdue: number;
}

function completion(recipients: { status: RecipientStatus; dueAt: Date | null }[], now = new Date()): Completion {
  const result = { assigned: 0, completed: 0, awaitingReview: 0, open: 0, overdue: 0 };
  for (const r of recipients) {
    if (r.status === 'EXCUSED') continue;
    result.assigned++;
    if (r.status === 'COMPLETED') result.completed++;
    else if (r.status === 'AWAITING_REVIEW') result.awaitingReview++;
    else result.open++;
    if (isOverdue(r.status, r.dueAt, now)) result.overdue++;
  }
  return result;
}

/**
 * Read models over the evidence fact table and assignment records. Aggregation is done in
 * the query path for now; pre-computed rollups are only worth adding once volume demands it.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly assignments: AssignmentsService,
  ) {}

  /** One student: performance by skill and task type, completion, and recent band estimates. */
  async student(user: Principal, studentId: string) {
    await this.access.requireStudentVisible(user, studentId);
    const [student, evidence, recipients, estimates] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: studentId },
        select: { id: true, fullName: true, studentProfile: { select: { targetBand: true, examDate: true, module: true } } },
      }),
      this.prisma.skillEvidence.findMany({
        where: { centerId: user.centerId, studentId },
        orderBy: { occurredAt: 'desc' },
        take: EVIDENCE_LIMIT,
      }),
      this.prisma.assignmentRecipient.findMany({
        where: { studentId, assignment: { cancelledAt: null } },
        select: { status: true, assignment: { select: { dueAt: true } } },
      }),
      this.prisma.attempt.findMany({
        where: { studentId, bandEstimate: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          bandEstimate: true,
          submittedAt: true,
          version: { select: { taskSet: { select: { title: true, skill: true } } } },
        },
      }),
    ]);

    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        targetBand: student.studentProfile?.targetBand ?? null,
        examDate: student.studentProfile?.examDate ?? null,
      },
      completion: completion(recipients.map((r) => ({ status: r.status, dueAt: r.assignment.dueAt }))),
      skills: summarise(evidence),
      /** Practice estimates from full-length timed tests. Not official IELTS results. */
      bandEstimates: estimates.map((a) => ({
        attemptId: a.id,
        skill: a.version.taskSet.skill,
        title: a.version.taskSet.title,
        band: a.bandEstimate,
        submittedAt: a.submittedAt,
        isEstimate: true,
      })),
    };
  }

  /** One class: who is keeping up, and which skills and task types the group finds hard. */
  async group(user: Principal, groupId: string) {
    const group = await this.access.requireGroup(user, groupId);
    const [enrollments, recipients, evidence] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { groupId, endedOn: null },
        select: { student: { select: { id: true, fullName: true } } },
        orderBy: { student: { fullName: 'asc' } },
      }),
      this.prisma.assignmentRecipient.findMany({
        where: { assignment: { groupId, cancelledAt: null } },
        select: { studentId: true, status: true, assignment: { select: { dueAt: true } } },
      }),
      this.prisma.skillEvidence.findMany({
        where: { centerId: user.centerId, groupId },
        orderBy: { occurredAt: 'desc' },
        take: EVIDENCE_LIMIT,
      }),
    ]);

    return {
      group: { id: group.id, name: group.name, branchId: group.branchId },
      completion: completion(recipients.map((r) => ({ status: r.status, dueAt: r.assignment.dueAt }))),
      skills: summarise(evidence),
      students: enrollments.map(({ student }) => {
        const own = evidence.filter((e) => e.studentId === student.id && e.kind === 'AUTO_SCORED');
        const max = own.reduce((sum, e) => sum + e.maxScore, 0);
        return {
          ...student,
          completion: completion(
            recipients.filter((r) => r.studentId === student.id).map((r) => ({ status: r.status, dueAt: r.assignment.dueAt })),
          ),
          /** Pooled accuracy on auto-scored work; null when there is no evidence yet. */
          accuracy: max > 0 ? Math.round((own.reduce((sum, e) => sum + e.score, 0) / max) * 1000) / 1000 : null,
          evidenceCount: own.length,
        };
      }),
    };
  }

  /** One assignment: who did it, how they scored, and which questions the class got wrong. */
  async assignment(user: Principal, assignmentId: string) {
    const assignment = await this.assignments.find(user, assignmentId);
    const [tree, recipients] = await Promise.all([
      this.prisma.taskSetVersion.findUniqueOrThrow({ where: { id: assignment.versionId }, include: versionTree }),
      this.prisma.assignmentRecipient.findMany({
        where: { assignmentId },
        include: {
          student: { select: { id: true, fullName: true } },
          // The most recent handed-in attempt is the one that counts.
          attempts: { where: { status: { not: 'IN_PROGRESS' } }, orderBy: { submittedAt: 'desc' }, take: 1 },
        },
        orderBy: { student: { fullName: 'asc' } },
      }),
    ]);

    const counted = recipients.flatMap((r) => (r.attempts[0] ? [r.attempts[0]] : []));
    const responses = await this.prisma.response.findMany({
      where: { attemptId: { in: counted.map((a) => a.id) }, isCorrect: { not: null } },
      select: { questionId: true, isCorrect: true },
    });
    const correctByQuestion = new Map<string, number>();
    for (const r of responses) {
      if (r.isCorrect) correctByQuestion.set(r.questionId, (correctByQuestion.get(r.questionId) ?? 0) + 1);
    }

    const submitted = counted.length;
    const now = new Date();
    const score = counted.reduce((sum, a) => sum + (a.score ?? 0), 0);
    const maxScore = counted.reduce((sum, a) => sum + (a.maxScore ?? 0), 0);
    return {
      assignment,
      submitted,
      /** Pooled accuracy on auto-scored questions across handed-in attempts. */
      accuracy: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 1000 : null,
      questions: flattenQuestions(tree)
        .filter((q) => !q.manual)
        .map((q) => {
          const correct = correctByQuestion.get(q.question.id) ?? 0;
          return {
            questionId: q.question.id,
            number: q.question.number,
            skill: q.skill,
            type: q.type,
            correct,
            total: submitted,
            accuracy: submitted > 0 ? Math.round((correct / submitted) * 1000) / 1000 : null,
          };
        }),
      students: recipients.map((r) => {
        const attempt = r.attempts[0];
        return {
          student: r.student,
          status: r.status,
          overdue: isOverdue(r.status, assignment.dueAt, now),
          attemptId: attempt?.id ?? null,
          score: attempt?.score ?? null,
          maxScore: attempt?.maxScore ?? null,
          bandEstimate: attempt?.bandEstimate ?? null,
          submittedAt: attempt?.submittedAt ?? null,
        };
      }),
    };
  }
}
