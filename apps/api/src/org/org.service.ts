import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { BranchSummary, CreateGroupRequest, GroupSummary, StudentSummary } from '@erp/contracts';
import { branchFilter, canManageGroupsInBranch, groupFilter } from '../access/access.policy.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const activeEnrollment = { endedOn: null };

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async branches(user: Principal): Promise<BranchSummary[]> {
    const where = branchFilter(user);
    if (!where) return [];
    return this.prisma.branch.findMany({ where, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  async groups(user: Principal): Promise<GroupSummary[]> {
    const where = groupFilter(user);
    if (!where) return [];
    const groups = await this.prisma.group.findMany({
      where: { ...where, archivedAt: null },
      include: {
        branch: { select: { name: true } },
        course: { select: { name: true } },
        level: { select: { name: true } },
        _count: { select: { enrollments: { where: activeEnrollment } } },
      },
      orderBy: { name: 'asc' },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      branchId: g.branchId,
      branchName: g.branch.name,
      courseName: g.course.name,
      levelName: g.level?.name ?? null,
      studentCount: g._count.enrollments,
    }));
  }

  /** Students currently enrolled in any group the caller may see. */
  async students(user: Principal): Promise<StudentSummary[]> {
    const where = groupFilter(user);
    if (!where) return [];
    const students = await this.prisma.user.findMany({
      where: {
        centerId: user.centerId,
        studentProfile: { isNot: null },
        enrollments: { some: { ...activeEnrollment, group: where } },
      },
      include: {
        studentProfile: { select: { targetBand: true } },
        // Only list the groups the caller is allowed to see, not every group the student is in.
        enrollments: {
          where: { ...activeEnrollment, group: where },
          select: { group: { select: { id: true, name: true } } },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    return students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      username: s.username,
      targetBand: s.studentProfile?.targetBand ?? null,
      groups: s.enrollments.map((e) => e.group),
    }));
  }

  async createGroup(user: Principal, input: CreateGroupRequest): Promise<{ id: string }> {
    if (!canManageGroupsInBranch(user, input.branchId)) throw new ForbiddenException();

    // Everything referenced must belong to the caller's centre.
    const [branch, course, level] = await Promise.all([
      this.prisma.branch.findFirst({ where: { id: input.branchId, centerId: user.centerId } }),
      this.prisma.course.findFirst({ where: { id: input.courseId, centerId: user.centerId } }),
      input.levelId
        ? this.prisma.level.findFirst({ where: { id: input.levelId, courseId: input.courseId } })
        : null,
    ]);
    if (!branch || !course || (input.levelId && !level)) {
      throw new NotFoundException('Branch, course or level not found');
    }

    const group = await this.prisma.group.create({
      data: {
        centerId: user.centerId,
        branchId: input.branchId,
        courseId: input.courseId,
        levelId: input.levelId ?? null,
        name: input.name,
      },
      select: { id: true },
    });
    await this.audit.record({
      action: 'group.create',
      actorId: user.userId,
      centerId: user.centerId,
      entityType: 'Group',
      entityId: group.id,
      data: { name: input.name, branchId: input.branchId },
    });
    return group;
  }
}
