import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { groupFilter, staffScope } from './access.policy.js';
import type { Principal } from './principal.js';

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

  async requireGroup(user: Principal, groupId: string): Promise<{ id: string; branchId: string; name: string }> {
    const where = groupFilter(user);
    const group = where
      ? await this.prisma.group.findFirst({
          where: { ...where, id: groupId },
          select: { id: true, branchId: true, name: true },
        })
      : null;
    if (!group) throw new NotFoundException('Group not found');
    return group;
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
