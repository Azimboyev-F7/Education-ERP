import { z } from 'zod';
import { StaffRoleName } from '../accounts.js';
import { IeltsModule } from '../content.js';
import { IdRef, IsoDateTime, named } from './common.js';

export const UserStatus = named('UserStatus', z.enum(['ACTIVE', 'DISABLED']));

export const StaffMember = named(
  'StaffMember',
  z.object({
    id: z.string(),
    username: z.string(),
    fullName: z.string(),
    status: UserStatus,
    mustChangePassword: z.boolean(),
    roles: z.array(z.object({ role: StaffRoleName, branchId: z.string().nullable() })),
    /** Groups this person teaches. */
    groups: z.array(IdRef),
  }),
);
export type StaffMember = z.infer<typeof StaffMember>;
export const StaffList = z.array(StaffMember);

/**
 * Returned once, when an account is created. The password is random, never stored or logged, and
 * the response is sent with `Cache-Control: no-store`.
 */
export const Credentials = named('Credentials', z.object({ id: z.string(), temporaryPassword: z.string() }));
export type Credentials = z.infer<typeof Credentials>;

export const PasswordReset = named('PasswordReset', z.object({ temporaryPassword: z.string() }));
export type PasswordReset = z.infer<typeof PasswordReset>;

export const StudentDetail = named(
  'StudentDetail',
  z.object({
    id: z.string(),
    username: z.string(),
    fullName: z.string(),
    status: UserStatus,
    mustChangePassword: z.boolean(),
    createdAt: IsoDateTime,
    profile: z.object({ targetBand: z.number().nullable(), examDate: IsoDateTime.nullable(), module: IeltsModule }).nullable(),
    /** Current groups the caller is allowed to see. */
    groups: z.array(z.object({ id: z.string(), name: z.string(), enrolledOn: IsoDateTime })),
  }),
);
export type StudentDetail = z.infer<typeof StudentDetail>;
