import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AssignmentQuery, CreateAssignmentRequest } from '@erp/contracts';
import { assignmentFilter } from '../access/access.policy.js';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import type { RecipientStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Overdue is derived, never stored: the due date has passed and the work is not handed in. */
export function isOverdue(status: RecipientStatus, dueAt: Date | null, now = new Date()): boolean {
  return dueAt !== null && dueAt < now && (status === 'ASSIGNED' || status === 'STARTED');
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async create(user: Principal, input: CreateAssignmentRequest): Promise<{ id: string; recipients: number }> {
    const version = await this.prisma.taskSetVersion.findFirst({
      where: { id: input.versionId, taskSet: { centerId: user.centerId } },
      select: { id: true, status: true },
    });
    if (!version) throw new NotFoundException('Task set version not found');
    if (version.status !== 'PUBLISHED') throw new ConflictException('Only published task sets can be assigned');

    // Audience: everyone currently enrolled in the group, plus any named students.
    const studentIds = new Set<string>();
    if (input.groupId) {
      await this.access.requireGroup(user, input.groupId);
      const enrolled = await this.prisma.enrollment.findMany({
        where: { groupId: input.groupId, endedOn: null },
        select: { studentId: true },
      });
      for (const e of enrolled) studentIds.add(e.studentId);
    }
    if (input.studentIds.length > 0) {
      const visible = await this.access.visibleStudentIds(user);
      const known = await this.prisma.user.findMany({
        where: { id: { in: input.studentIds }, centerId: user.centerId, studentProfile: { isNot: null } },
        select: { id: true },
      });
      const allowed = new Set(known.map((s) => s.id).filter((id) => visible === 'all' || visible.includes(id)));
      if (input.studentIds.some((id) => !allowed.has(id))) throw new NotFoundException('Student not found');
      for (const id of input.studentIds) studentIds.add(id);
    }
    if (studentIds.size === 0) throw new BadRequestException('There are no students to assign this to');

    const assignment = await this.prisma.assignment.create({
      data: {
        centerId: user.centerId,
        versionId: version.id,
        groupId: input.groupId ?? null,
        kind: input.kind,
        title: input.title,
        instructions: input.instructions,
        opensAt: input.opensAt,
        dueAt: input.dueAt,
        timeLimitSec: input.timeLimitSec,
        maxAttempts: input.maxAttempts,
        createdById: user.userId,
        recipients: { create: [...studentIds].map((studentId) => ({ studentId })) },
      },
      select: { id: true },
    });
    await this.audit.record({
      action: 'assignment.create',
      actorId: user.userId,
      centerId: user.centerId,
      entityType: 'Assignment',
      entityId: assignment.id,
      data: { versionId: version.id, groupId: input.groupId ?? null, recipients: studentIds.size },
    });
    return { id: assignment.id, recipients: studentIds.size };
  }

  async list(user: Principal, query: AssignmentQuery) {
    const where = assignmentFilter(user);
    if (!where) return [];
    const assignments = await this.prisma.assignment.findMany({
      where: { ...where, cancelledAt: null, ...(query.groupId ? { groupId: query.groupId } : {}) },
      include: {
        group: { select: { id: true, name: true } },
        version: { select: { id: true, number: true, taskSet: { select: { title: true, skill: true } } } },
        recipients: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return assignments.map((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      group: a.group,
      taskSet: { versionId: a.version.id, title: a.version.taskSet.title, skill: a.version.taskSet.skill },
      opensAt: a.opensAt,
      dueAt: a.dueAt,
      counts: countStatuses(a.recipients, a.dueAt, now),
    }));
  }

  async get(user: Principal, id: string) {
    const assignment = await this.find(user, id);
    const recipients = await this.prisma.assignmentRecipient.findMany({
      where: { assignmentId: id },
      include: {
        student: { select: { id: true, fullName: true } },
        attempts: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true, status: true, score: true, maxScore: true, bandEstimate: true, submittedAt: true },
        },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
    const now = new Date();
    return {
      ...assignment,
      counts: countStatuses(recipients, assignment.dueAt, now),
      recipients: recipients.map((r) => ({
        id: r.id,
        student: r.student,
        status: r.status,
        overdue: isOverdue(r.status, assignment.dueAt, now),
        completedAt: r.completedAt,
        latestAttempt: r.attempts[0] ?? null,
      })),
    };
  }

  /** Removes the obligation for one student without deleting any work already done. */
  async excuse(user: Principal, id: string, studentId: string): Promise<void> {
    await this.find(user, id);
    const { count } = await this.prisma.assignmentRecipient.updateMany({
      where: { assignmentId: id, studentId, status: { in: ['ASSIGNED', 'STARTED'] } },
      data: { status: 'EXCUSED' },
    });
    if (count === 0) throw new ConflictException('This student has no open work on this assignment');
    await this.audit.record({
      action: 'assignment.excuse',
      actorId: user.userId,
      centerId: user.centerId,
      entityType: 'Assignment',
      entityId: id,
      data: { studentId },
    });
  }

  async cancel(user: Principal, id: string): Promise<void> {
    await this.find(user, id);
    await this.prisma.assignment.update({ where: { id }, data: { cancelledAt: new Date() } });
    await this.audit.record({
      action: 'assignment.cancel',
      actorId: user.userId,
      centerId: user.centerId,
      entityType: 'Assignment',
      entityId: id,
    });
  }

  /** The signed-in student's own work list. */
  async mine(user: Principal) {
    this.access.requireStudent(user);
    const recipients = await this.prisma.assignmentRecipient.findMany({
      where: { studentId: user.userId, assignment: { cancelledAt: null } },
      include: {
        assignment: {
          select: {
            id: true,
            title: true,
            kind: true,
            instructions: true,
            opensAt: true,
            dueAt: true,
            timeLimitSec: true,
            maxAttempts: true,
            version: { select: { timeLimitSec: true, taskSet: { select: { title: true, skill: true } } } },
          },
        },
        _count: { select: { attempts: true } },
      },
      orderBy: { assignment: { createdAt: 'desc' } },
    });
    const now = new Date();
    return recipients.map((r) => ({
      recipientId: r.id,
      assignmentId: r.assignment.id,
      title: r.assignment.title,
      kind: r.assignment.kind,
      instructions: r.assignment.instructions,
      skill: r.assignment.version.taskSet.skill,
      opensAt: r.assignment.opensAt,
      dueAt: r.assignment.dueAt,
      timeLimitSec: r.assignment.timeLimitSec ?? r.assignment.version.timeLimitSec,
      status: r.status,
      overdue: isOverdue(r.status, r.assignment.dueAt, now),
      attemptsUsed: r._count.attempts,
      attemptsAllowed: r.assignment.maxAttempts,
    }));
  }

  /** Loads an assignment the caller is allowed to see, or reports it as missing. */
  async find(user: Principal, id: string) {
    const where = assignmentFilter(user);
    if (!where) throw new ForbiddenException();
    const assignment = await this.prisma.assignment.findFirst({
      where: { ...where, id },
      select: {
        id: true,
        title: true,
        kind: true,
        instructions: true,
        opensAt: true,
        dueAt: true,
        timeLimitSec: true,
        maxAttempts: true,
        cancelledAt: true,
        versionId: true,
        group: { select: { id: true, name: true } },
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return assignment;
  }
}

function countStatuses(recipients: { status: RecipientStatus }[], dueAt: Date | null, now: Date) {
  const counts = { total: recipients.length, assigned: 0, started: 0, awaitingReview: 0, completed: 0, excused: 0, overdue: 0 };
  for (const r of recipients) {
    if (r.status === 'ASSIGNED') counts.assigned++;
    else if (r.status === 'STARTED') counts.started++;
    else if (r.status === 'AWAITING_REVIEW') counts.awaitingReview++;
    else if (r.status === 'COMPLETED') counts.completed++;
    else counts.excused++;
    if (isOverdue(r.status, dueAt, now)) counts.overdue++;
  }
  return counts;
}
