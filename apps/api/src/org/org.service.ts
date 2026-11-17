import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BranchSummary,
  CreateBranchRequest,
  CreateCourseRequest,
  CreateGroupRequest,
  CreateLevelRequest,
  CreatePeriodRequest,
  GroupSummary,
  StudentSummary,
  UpdateGroupRequest,
} from '@erp/contracts';
import {
  branchFilter,
  canManageGroupsInBranch,
  canManageStaff,
  groupFilter,
} from '../access/access.policy.js';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { orConflict } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

const activeEnrollment = { endedOn: null };
const conflict = (message: string) => new ConflictException(message);

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  // ───────────── reading ─────────────

  async branches(user: Principal): Promise<BranchSummary[]> {
    const where = branchFilter(user);
    if (!where) return [];
    return this.prisma.branch.findMany({ where, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  /** Courses and levels, for building group forms. Visible to all staff. */
  courses(user: Principal) {
    return this.prisma.course.findMany({
      where: { centerId: user.centerId },
      select: { id: true, name: true, levels: { select: { id: true, name: true, position: true }, orderBy: { position: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  periods(user: Principal) {
    return this.prisma.academicPeriod.findMany({
      where: { centerId: user.centerId },
      select: { id: true, name: true, startsOn: true, endsOn: true },
      orderBy: { startsOn: 'desc' },
    });
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

  /** One group with its teachers and current roster. */
  async group(user: Principal, id: string) {
    const scoped = await this.access.requireGroup(user, id);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        course: { select: { id: true, name: true } },
        level: { select: { id: true, name: true } },
        period: { select: { id: true, name: true } },
        teachers: { select: { user: { select: { id: true, fullName: true } } } },
        enrollments: {
          where: activeEnrollment,
          select: {
            startedOn: true,
            student: { select: { id: true, fullName: true, username: true, status: true, studentProfile: { select: { targetBand: true } } } },
          },
          orderBy: { student: { fullName: 'asc' } },
        },
      },
    });
    return {
      id: group.id,
      name: group.name,
      archivedAt: group.archivedAt,
      branch: group.branch,
      course: group.course,
      level: group.level,
      period: group.period,
      /** Whether the caller may restructure this group (rename, enrol, assign teachers). */
      canManage: canManageGroupsInBranch(user, scoped.branchId),
      teachers: group.teachers.map((t) => t.user),
      students: group.enrollments.map((e) => ({
        id: e.student.id,
        fullName: e.student.fullName,
        username: e.student.username,
        active: e.student.status === 'ACTIVE',
        targetBand: e.student.studentProfile?.targetBand ?? null,
        enrolledOn: e.startedOn,
      })),
    };
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

  // ───────────── centre structure (administrators) ─────────────

  async createBranch(user: Principal, input: CreateBranchRequest): Promise<{ id: string }> {
    this.requireAdministrator(user);
    const branch = await orConflict(
      () => this.prisma.branch.create({ data: { centerId: user.centerId, name: input.name }, select: { id: true } }),
      conflict,
      'A branch with this name already exists',
    );
    await this.record(user, 'branch.create', 'Branch', branch.id, { name: input.name });
    return branch;
  }

  async createCourse(user: Principal, input: CreateCourseRequest): Promise<{ id: string }> {
    this.requireAdministrator(user);
    const course = await orConflict(
      () => this.prisma.course.create({ data: { centerId: user.centerId, name: input.name }, select: { id: true } }),
      conflict,
      'A course with this name already exists',
    );
    await this.record(user, 'course.create', 'Course', course.id, { name: input.name });
    return course;
  }

  /** Levels are appended after the course's existing ones. */
  async createLevel(user: Principal, courseId: string, input: CreateLevelRequest): Promise<{ id: string }> {
    this.requireAdministrator(user);
    const course = await this.prisma.course.findFirst({ where: { id: courseId, centerId: user.centerId }, select: { id: true } });
    if (!course) throw new NotFoundException('Course not found');
    const last = await this.prisma.level.aggregate({ where: { courseId }, _max: { position: true } });
    const level = await orConflict(
      () =>
        this.prisma.level.create({
          data: { courseId, name: input.name, position: (last._max.position ?? -1) + 1 },
          select: { id: true },
        }),
      conflict,
      'This course already has a level with that name',
    );
    await this.record(user, 'level.create', 'Level', level.id, { name: input.name, courseId });
    return level;
  }

  async createPeriod(user: Principal, input: CreatePeriodRequest): Promise<{ id: string }> {
    this.requireAdministrator(user);
    const period = await orConflict(
      () =>
        this.prisma.academicPeriod.create({
          data: {
            centerId: user.centerId,
            name: input.name,
            startsOn: new Date(input.startsOn),
            endsOn: new Date(input.endsOn),
          },
          select: { id: true },
        }),
      conflict,
      'An academic period with this name already exists',
    );
    await this.record(user, 'period.create', 'AcademicPeriod', period.id, { name: input.name });
    return period;
  }

  // ───────────── groups (administrators and managers of the branch) ─────────────

  async createGroup(user: Principal, input: CreateGroupRequest): Promise<{ id: string }> {
    if (!canManageGroupsInBranch(user, input.branchId)) throw new ForbiddenException();

    // Everything referenced must belong to the caller's centre.
    const [branch, course, level, period] = await Promise.all([
      this.prisma.branch.findFirst({ where: { id: input.branchId, centerId: user.centerId } }),
      this.prisma.course.findFirst({ where: { id: input.courseId, centerId: user.centerId } }),
      input.levelId ? this.prisma.level.findFirst({ where: { id: input.levelId, courseId: input.courseId } }) : null,
      input.periodId ? this.prisma.academicPeriod.findFirst({ where: { id: input.periodId, centerId: user.centerId } }) : null,
    ]);
    if (!branch || !course || (input.levelId && !level) || (input.periodId && !period)) {
      throw new NotFoundException('Branch, course, level or period not found');
    }

    const group = await this.prisma.group.create({
      data: {
        centerId: user.centerId,
        branchId: input.branchId,
        courseId: input.courseId,
        levelId: input.levelId ?? null,
        periodId: input.periodId ?? null,
        name: input.name,
      },
      select: { id: true },
    });
    await this.record(user, 'group.create', 'Group', group.id, { name: input.name, branchId: input.branchId });
    return group;
  }

  async updateGroup(user: Principal, id: string, input: UpdateGroupRequest): Promise<void> {
    const group = await this.manageableGroup(user, id);

    if (input.levelId) {
      const level = await this.prisma.level.findFirst({ where: { id: input.levelId, courseId: group.courseId } });
      if (!level) throw new NotFoundException('Level not found in this group’s course');
    }
    if (input.periodId) {
      const period = await this.prisma.academicPeriod.findFirst({ where: { id: input.periodId, centerId: user.centerId } });
      if (!period) throw new NotFoundException('Academic period not found');
    }

    await this.prisma.group.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.levelId === undefined ? {} : { levelId: input.levelId }),
        ...(input.periodId === undefined ? {} : { periodId: input.periodId }),
      },
    });
    await this.record(user, 'group.update', 'Group', id, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.levelId === undefined ? {} : { levelId: input.levelId }),
      ...(input.periodId === undefined ? {} : { periodId: input.periodId }),
    });
  }

  /** Closes a group: it disappears from lists and its students are released (history is kept). */
  async archiveGroup(user: Principal, id: string): Promise<void> {
    await this.manageableGroup(user, id);
    const released = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.group.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
      if (claimed.count === 0) throw new ConflictException('This group is already archived');
      const ended = await tx.enrollment.updateMany({ where: { groupId: id, endedOn: null }, data: { endedOn: new Date() } });
      return ended.count;
    });
    await this.record(user, 'group.archive', 'Group', id, { studentsReleased: released });
  }

  async addTeacher(user: Principal, groupId: string, teacherId: string): Promise<void> {
    await this.manageableGroup(user, groupId);
    const teacher = await this.prisma.user.findFirst({
      where: {
        id: teacherId,
        centerId: user.centerId,
        status: 'ACTIVE',
        roleAssignments: { some: { role: 'TEACHER' } },
      },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    await this.prisma.groupTeacher.createMany({ data: [{ groupId, userId: teacherId }], skipDuplicates: true });
    await this.record(user, 'group.teacher_add', 'Group', groupId, { teacherId });
  }

  async removeTeacher(user: Principal, groupId: string, teacherId: string): Promise<void> {
    await this.manageableGroup(user, groupId);
    await this.prisma.groupTeacher.deleteMany({ where: { groupId, userId: teacherId } });
    await this.record(user, 'group.teacher_remove', 'Group', groupId, { teacherId });
  }

  // ───────────── internals ─────────────

  private requireAdministrator(user: Principal): void {
    if (!canManageStaff(user)) throw new ForbiddenException('Only administrators can change the centre structure');
  }

  private manageableGroup(user: Principal, id: string) {
    return this.access.requireManageableGroup(user, id);
  }

  private record(user: Principal, action: string, entityType: string, entityId: string, data: Record<string, string | number | boolean | null>) {
    return this.audit.record({ action, actorId: user.userId, centerId: user.centerId, entityType, entityId, data });
  }
}
