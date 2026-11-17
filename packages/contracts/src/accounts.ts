import { z } from 'zod';
import { IeltsModule } from './content.js';
import { Band } from './reviews.js';

/** Usernames are stored lowercase so sign-in does not depend on how someone types them. */
export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, '3-32 characters: letters, digits, dot, dash or underscore');

const FullName = z.string().trim().min(1).max(120);

/** Long enough to resist guessing; no composition rules, which add friction without adding safety. */
export const NewPassword = z.string().min(10, 'Use at least 10 characters').max(128);

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: NewPassword,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

export const StaffRoleName = z.enum(['ADMINISTRATOR', 'ACADEMIC_MANAGER', 'TEACHER']).meta({ id: 'StaffRole' });
export type StaffRoleName = z.infer<typeof StaffRoleName>;

export const StaffRoleGrant = z
  .object({ role: StaffRoleName, branchId: z.string().min(1).nullable().default(null) })
  .refine((g) => (g.role === 'ACADEMIC_MANAGER') === (g.branchId !== null), {
    message: 'An academic manager needs a branch; other roles must not have one',
    path: ['branchId'],
  });
export type StaffRoleGrant = z.infer<typeof StaffRoleGrant>;

const Roles = z
  .array(StaffRoleGrant)
  .min(1, 'Give the account at least one role')
  .max(10)
  .refine((roles) => new Set(roles.map((r) => `${r.role}|${r.branchId}`)).size === roles.length, {
    message: 'The same role is listed twice',
  });

export const CreateStaffRequest = z.object({ username: Username, fullName: FullName, roles: Roles });
export type CreateStaffRequest = z.infer<typeof CreateStaffRequest>;

export const SetRolesRequest = z.object({ roles: Roles });
export type SetRolesRequest = z.infer<typeof SetRolesRequest>;

export const UpdateStaffRequest = z.object({ fullName: FullName });
export type UpdateStaffRequest = z.infer<typeof UpdateStaffRequest>;

const IsoDate = z.iso.date();

export const CreateStudentRequest = z.object({
  username: Username,
  fullName: FullName,
  /** Enrol straight into this group. Only administrators may leave it out. */
  groupId: z.string().min(1).optional(),
  targetBand: Band.optional(),
  examDate: IsoDate.optional(),
  module: IeltsModule.default('ACADEMIC'),
});
export type CreateStudentRequest = z.infer<typeof CreateStudentRequest>;

export const UpdateStudentRequest = z
  .object({
    fullName: FullName.optional(),
    targetBand: Band.nullable().optional(),
    examDate: IsoDate.nullable().optional(),
    module: IeltsModule.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to change' });
export type UpdateStudentRequest = z.infer<typeof UpdateStudentRequest>;

export const EnrolRequest = z.object({ studentId: z.string().min(1) });
export type EnrolRequest = z.infer<typeof EnrolRequest>;

export const TransferRequest = z
  .object({ fromGroupId: z.string().min(1), toGroupId: z.string().min(1) })
  .refine((v) => v.fromGroupId !== v.toGroupId, { message: 'Choose a different group', path: ['toGroupId'] });
export type TransferRequest = z.infer<typeof TransferRequest>;

// ───────────── centre structure ─────────────

const Name = z.string().trim().min(1).max(120);

export const CreateBranchRequest = z.object({ name: Name });
export type CreateBranchRequest = z.infer<typeof CreateBranchRequest>;

export const CreateCourseRequest = z.object({ name: Name });
export type CreateCourseRequest = z.infer<typeof CreateCourseRequest>;

export const CreateLevelRequest = z.object({ name: Name });
export type CreateLevelRequest = z.infer<typeof CreateLevelRequest>;

export const CreatePeriodRequest = z
  .object({ name: Name, startsOn: IsoDate, endsOn: IsoDate })
  .refine((v) => v.startsOn < v.endsOn, { message: 'The end must be after the start', path: ['endsOn'] });
export type CreatePeriodRequest = z.infer<typeof CreatePeriodRequest>;

export const UpdateGroupRequest = z
  .object({
    name: Name.optional(),
    levelId: z.string().min(1).nullable().optional(),
    periodId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to change' });
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequest>;

export const GroupTeacherRequest = z.object({ userId: z.string().min(1) });
export type GroupTeacherRequest = z.infer<typeof GroupTeacherRequest>;
