import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { Tx } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ALREADY_ENROLLED = 'This student is already in that group';

/**
 * Group membership. Enrolments are dated rather than deleted, so a student's history survives
 * a move, and evidence recorded while they were in a group stays with that group.
 * Assignments are expanded when they are made, so joining a group later does not hand a student
 * work that was set earlier; teachers assign that to the individual if they want it done.
 */
@Injectable()
export class EnrolmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async enrol(user: Principal, groupId: string, studentId: string): Promise<void> {
    const group = await this.access.requireManageableGroup(user, groupId);
    const student = await this.access.requireManagedStudent(user, studentId, { allowUnenrolled: true });
    if (student.status !== 'ACTIVE') throw new ConflictException('This account is disabled');

    await this.prisma.$transaction((tx) => this.join(tx, groupId, studentId));
    await this.record(user, 'enrolment.add', studentId, { groupId: group.id });
  }

  async unenrol(user: Principal, groupId: string, studentId: string): Promise<void> {
    await this.access.requireManageableGroup(user, groupId);
    const ended = await this.prisma.enrollment.updateMany({
      where: { groupId, studentId, endedOn: null },
      data: { endedOn: new Date() },
    });
    if (ended.count === 0) throw new NotFoundException('This student is not in that group');
    await this.record(user, 'enrolment.end', studentId, { groupId });
  }

  /** Moves a student between two groups in one step, so they are never in neither. */
  async transfer(user: Principal, studentId: string, fromGroupId: string, toGroupId: string): Promise<void> {
    await this.access.requireManageableGroup(user, fromGroupId);
    await this.access.requireManageableGroup(user, toGroupId);

    await this.prisma.$transaction(async (tx) => {
      const ended = await tx.enrollment.updateMany({
        where: { groupId: fromGroupId, studentId, endedOn: null },
        data: { endedOn: new Date() },
      });
      if (ended.count === 0) throw new NotFoundException('This student is not in the group they are moving from');
      await this.join(tx, toGroupId, studentId);
    });
    await this.record(user, 'enrolment.transfer', studentId, { fromGroupId, toGroupId });
  }

  private async join(tx: Tx, groupId: string, studentId: string): Promise<void> {
    try {
      await tx.enrollment.create({ data: { groupId, studentId } });
    } catch (error) {
      // The partial unique index (one open enrolment per student and group) is the real guard;
      // this is what a concurrent duplicate request runs into.
      if (isUniqueViolation(error)) throw new ConflictException(ALREADY_ENROLLED);
      throw error;
    }
  }

  private record(user: Principal, action: string, studentId: string, data: Record<string, string>) {
    return this.audit.record({ action, actorId: user.userId, centerId: user.centerId, entityType: 'User', entityId: studentId, data });
  }
}
