import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateStaffRequest,
  CreateStudentRequest,
  SetRolesRequest,
  StaffRoleGrant,
  UpdateStaffRequest,
  UpdateStudentRequest,
} from '@erp/contracts';
import { canManageStaff, canManageStudents, groupFilter, managedBranches } from '../access/access.policy.js';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { generateTemporaryPassword, hashPassword } from '../auth/password.js';
import { orConflict } from '../common/prisma-errors.js';
import type { Tx } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const taken = (message: string) => new ConflictException(message);
const USERNAME_TAKEN = 'This username is already taken';

/** Created with a one-time password that the caller shows to the new user. It is never stored or logged. */
export interface Credentials {
  id: string;
  temporaryPassword: string;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── staff (administrators) ─────────────

  /** Staff accounts, for administrators and for managers who assign teachers to groups. */
  async listStaff(user: Principal) {
    if (!canManageStudents(user)) throw new ForbiddenException();
    const staff = await this.prisma.user.findMany({
      where: { centerId: user.centerId, roleAssignments: { some: {} } },
      select: {
        id: true,
        username: true,
        fullName: true,
        status: true,
        mustChangePassword: true,
        roleAssignments: { select: { role: true, branchId: true } },
        teaching: { select: { group: { select: { id: true, name: true } } } },
      },
      orderBy: { fullName: 'asc' },
    });
    return staff.map((s) => ({
      id: s.id,
      username: s.username,
      fullName: s.fullName,
      status: s.status,
      mustChangePassword: s.mustChangePassword,
      roles: s.roleAssignments,
      groups: s.teaching.map((t) => t.group),
    }));
  }

  async createStaff(user: Principal, input: CreateStaffRequest): Promise<Credentials> {
    this.requireAdministrator(user);
    await this.requireBranches(user, input.roles);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const created = await orConflict(
      () =>
        this.prisma.user.create({
          data: {
            centerId: user.centerId,
            username: input.username,
            fullName: input.fullName,
            passwordHash,
            mustChangePassword: true,
            roleAssignments: { create: input.roles.map((r) => ({ role: r.role, branchId: r.branchId })) },
          },
          select: { id: true },
        }),
      taken,
      USERNAME_TAKEN,
    );
    await this.record(user, 'staff.create', created.id, { username: input.username, roles: describe(input.roles) });
    return { id: created.id, temporaryPassword };
  }

  async updateStaff(user: Principal, id: string, input: UpdateStaffRequest): Promise<void> {
    this.requireAdministrator(user);
    await this.requireStaff(user, id);
    await this.prisma.user.update({ where: { id }, data: { fullName: input.fullName } });
    await this.record(user, 'staff.update', id, { fullName: input.fullName });
  }

  /** Replaces a staff member's roles. The centre can never be left without an active administrator. */
  async setRoles(user: Principal, id: string, input: SetRolesRequest): Promise<void> {
    this.requireAdministrator(user);
    await this.requireStaff(user, id);
    await this.requireBranches(user, input.roles);

    const droppedTeaching = await this.prisma.$transaction(async (tx) => {
      await this.lockCentre(tx, user.centerId);
      await this.assertAdministratorRemains(tx, user.centerId, id, input.roles.some((r) => r.role === 'ADMINISTRATOR'));

      await tx.roleAssignment.deleteMany({ where: { userId: id } });
      await tx.roleAssignment.createMany({ data: input.roles.map((r) => ({ userId: id, role: r.role, branchId: r.branchId })) });

      // Without the TEACHER role a person cannot teach, so their group links go too.
      if (input.roles.some((r) => r.role === 'TEACHER')) return 0;
      return (await tx.groupTeacher.deleteMany({ where: { userId: id } })).count;
    });
    await this.record(user, 'staff.set_roles', id, { roles: describe(input.roles), groupsLeft: droppedTeaching });
  }

  // ───────────── students ─────────────

  async createStudent(user: Principal, input: CreateStudentRequest): Promise<Credentials> {
    if (!canManageStudents(user)) throw new ForbiddenException();
    if (!input.groupId && managedBranches(user) !== 'all') {
      throw new BadRequestException('Choose the group this student joins');
    }
    const group = input.groupId ? await this.access.requireManageableGroup(user, input.groupId) : null;

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const created = await orConflict(
      () =>
        this.prisma.user.create({
          data: {
            centerId: user.centerId,
            username: input.username,
            fullName: input.fullName,
            passwordHash,
            mustChangePassword: true,
            studentProfile: {
              create: {
                targetBand: input.targetBand ?? null,
                examDate: input.examDate ? new Date(input.examDate) : null,
                module: input.module,
              },
            },
            ...(group ? { enrollments: { create: { groupId: group.id } } } : {}),
          },
          select: { id: true },
        }),
      taken,
      USERNAME_TAKEN,
    );
    await this.record(user, 'student.create', created.id, { username: input.username, groupId: group?.id ?? null });
    return { id: created.id, temporaryPassword };
  }

  /** A student's profile and the groups the caller can see them in. */
  async student(user: Principal, id: string) {
    await this.access.requireStudentVisible(user, id);
    const where = groupFilter(user);
    const student = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
        studentProfile: { select: { targetBand: true, examDate: true, module: true } },
        enrollments: {
          where: { endedOn: null, ...(where ? { group: where } : {}) },
          select: { startedOn: true, group: { select: { id: true, name: true } } },
        },
      },
    });
    return {
      id: student.id,
      username: student.username,
      fullName: student.fullName,
      status: student.status,
      mustChangePassword: student.mustChangePassword,
      createdAt: student.createdAt,
      profile: student.studentProfile,
      groups: student.enrollments.map((e) => ({ ...e.group, enrolledOn: e.startedOn })),
    };
  }

  /**
   * Teachers and managers who can see a student may set their target band, exam date and module;
   * changing the name is an account change and needs management rights.
   */
  async updateStudent(user: Principal, id: string, input: UpdateStudentRequest): Promise<void> {
    if (input.fullName !== undefined) await this.access.requireManagedStudent(user, id, { allowUnenrolled: true });
    else await this.access.requireStudentVisible(user, id);

    const profile = {
      ...(input.targetBand === undefined ? {} : { targetBand: input.targetBand }),
      ...(input.examDate === undefined ? {} : { examDate: input.examDate === null ? null : new Date(input.examDate) }),
      ...(input.module === undefined ? {} : { module: input.module }),
    };
    await this.prisma.$transaction(async (tx) => {
      if (input.fullName !== undefined) await tx.user.update({ where: { id }, data: { fullName: input.fullName } });
      if (Object.keys(profile).length > 0) await tx.studentProfile.update({ where: { userId: id }, data: profile });
    });
    await this.record(user, 'student.update', id, {
      ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
      ...(input.targetBand === undefined ? {} : { targetBand: input.targetBand }),
      ...(input.examDate === undefined ? {} : { examDate: input.examDate }),
      ...(input.module === undefined ? {} : { module: input.module }),
    });
  }

  // ───────────── account lifecycle (staff and students) ─────────────

  /** Disabling signs the person out everywhere and blocks sign-in; their records are kept. */
  async setStatus(user: Principal, id: string, status: 'ACTIVE' | 'DISABLED'): Promise<void> {
    if (id === user.userId) throw new BadRequestException('You cannot change your own account status');
    const target = await this.requireManagedAccount(user, id);

    await this.prisma.$transaction(async (tx) => {
      if (status === 'DISABLED') {
        await this.lockCentre(tx, user.centerId);
        await this.assertAdministratorRemains(tx, user.centerId, id, false);
      }
      await tx.user.update({ where: { id }, data: { status } });
      if (status === 'DISABLED') await tx.session.deleteMany({ where: { userId: id } });
    });
    await this.record(user, status === 'DISABLED' ? 'user.disable' : 'user.enable', id, { username: target.username });
  }

  /** Issues a new one-time password and signs the person out everywhere. */
  async resetPassword(user: Principal, id: string): Promise<{ temporaryPassword: string }> {
    if (id === user.userId) throw new BadRequestException('Use "change password" for your own account');
    const target = await this.requireManagedAccount(user, id);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
      this.prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    await this.record(user, 'user.reset_password', id, { username: target.username });
    return { temporaryPassword };
  }

  // ───────────── internals ─────────────

  private requireAdministrator(user: Principal): void {
    if (!canManageStaff(user)) throw new ForbiddenException('Only administrators can manage staff accounts');
  }

  /** A staff account in the caller's centre. */
  private async requireStaff(user: Principal, id: string) {
    const staff = await this.prisma.user.findFirst({
      where: { id, centerId: user.centerId, roleAssignments: { some: {} } },
      select: { id: true, username: true },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  /** Staff accounts are for administrators; students for administrators and managers of their branch. */
  private async requireManagedAccount(user: Principal, id: string): Promise<{ username: string }> {
    const profile = await this.prisma.studentProfile.findFirst({ where: { userId: id, user: { centerId: user.centerId } }, select: { userId: true } });
    if (profile) return this.access.requireManagedStudent(user, id);
    this.requireAdministrator(user);
    return this.requireStaff(user, id);
  }

  /** Branches named in role grants must exist in the caller's centre. */
  private async requireBranches(user: Principal, roles: StaffRoleGrant[]): Promise<void> {
    const ids = [...new Set(roles.flatMap((r) => (r.branchId ? [r.branchId] : [])))];
    if (ids.length === 0) return;
    const found = await this.prisma.branch.count({ where: { id: { in: ids }, centerId: user.centerId } });
    if (found !== ids.length) throw new NotFoundException('Branch not found');
  }

  /** Serialises changes that could remove the last administrator. */
  private async lockCentre(tx: Tx, centerId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "Center" WHERE "id" = ${centerId} FOR UPDATE`;
  }

  private async assertAdministratorRemains(tx: Tx, centerId: string, changingId: string, staysAdministrator: boolean): Promise<void> {
    if (staysAdministrator) return;
    const others = await tx.user.count({
      where: { centerId, status: 'ACTIVE', id: { not: changingId }, roleAssignments: { some: { role: 'ADMINISTRATOR' } } },
    });
    if (others === 0) throw new ConflictException('The centre needs at least one active administrator');
  }

  private record(user: Principal, action: string, entityId: string, data: Record<string, string | number | boolean | null>) {
    return this.audit.record({ action, actorId: user.userId, centerId: user.centerId, entityType: 'User', entityId, data });
  }
}

const describe = (roles: StaffRoleGrant[]) => roles.map((r) => (r.branchId ? `${r.role}@${r.branchId}` : r.role)).join(', ');
