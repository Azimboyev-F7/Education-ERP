import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { canManageGroupsInBranch, groupFilter, managedBranches, staffScope } from './access.policy.js';
import type { Principal } from './principal.js';

export interface GroupRef {
  id: string;
  branchId: string;
  courseId: string;
  name: string;
  archivedAt: Date | null;
}

export interface StudentRef {
  id: string;
  username: string;
  fullName: string;
  status: 'ACTIVE' | 'DISABLED';
}

/**
 * Database-backed access checks. The rules themselves live in access.policy.ts;
 * this only applies them to rows. Out-of-scope rows are reported as "not found"
 * so their existence is not revealed.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  requireStudent(user: Principal): void {
    if (!user.isStudent) throw new ForbiddenException('Only students can do this');
  }

  async requireGroup(user: Principal, groupId: string): Promise<GroupRef> {
    const where = groupFilter(user);
    const group = where
      ? await this.prisma.group.findFirst({
          where: { ...where, id: groupId },
          select: { id: true, branchId: true, courseId: true, name: true, archivedAt: true },
        })
      : null;
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  /** A group the caller can see AND may restructure (rename, enrol, assign teachers). Archived groups are read-only. */
  async requireManageableGroup(user: Principal, groupId: string): Promise<GroupRef> {
    const group = await this.requireGroup(user, groupId);
    if (!canManageGroupsInBranch(user, group.branchId)) throw new ForbiddenException();
    if (group.archivedAt) throw new ConflictException('This group is archived');
    return group;
  }

  /**
   * A student the caller may manage (reset password, disable, rename, enrol): any student for
   * administrators; for academic managers, students enrolled in one of their branches.
   * `allowUnenrolled` also admits students with no current group, which only administrators
   * could otherwise reach, so that a manager can place a new or returning student.
   */
  async requireManagedStudent(user: Principal, studentId: string, options: { allowUnenrolled?: boolean } = {}): Promise<StudentRef> {
    const managed = managedBranches(user);
    if (managed !== 'all' && managed.length === 0) throw new ForbiddenException();

    const student = await this.prisma.user.findFirst({
      where: { id: studentId, centerId: user.centerId, studentProfile: { isNot: null } },
      select: { id: true, username: true, fullName: true, status: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    if (managed !== 'all') {
      const current = await this.prisma.enrollment.findMany({
        where: { studentId, endedOn: null },
        select: { group: { select: { branchId: true } } },
      });
      const inScope = current.some((e) => managed.includes(e.group.branchId));
      if (!inScope && !(options.allowUnenrolled && current.length === 0)) throw new NotFoundException('Student not found');
    }
    return student;
  }

  /** Ids of students the caller may see, or 'all' for centre-wide staff. */
  async visibleStudentIds(user: Principal): Promise<string[] | 'all'> {
    const scope = staffScope(user);
    if (scope.kind === 'center') return 'all';
    const where = groupFilter(user);
    if (!where) return [];
    const students = await this.prisma.user.findMany({
      where: { centerId: user.centerId, enrollments: { some: { endedOn: null, group: where } } },
      select: { id: true },
    });
    return students.map((s) => s.id);
  }

  /** Prisma filter on a `studentId` column for the students the caller may see. */
  async studentIdFilter(user: Principal): Promise<{ in: string[] } | undefined> {
    const ids = await this.visibleStudentIds(user);
    return ids === 'all' ? undefined : { in: ids };
  }

  async requireStudentVisible(user: Principal, studentId: string): Promise<void> {
    if (user.isStudent && user.userId === studentId) return;
    const ids = await this.visibleStudentIds(user);
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, centerId: user.centerId, studentProfile: { isNot: null } },
      select: { id: true },
    });
    if (!student || (ids !== 'all' && !ids.includes(studentId))) throw new NotFoundException('Student not found');
  }
}
