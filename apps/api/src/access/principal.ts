import type { RoleGrant } from '@erp/contracts';

/** The authenticated user, resolved once per request by SessionGuard. */
export interface Principal {
  userId: string;
  centerId: string;
  username: string;
  fullName: string;
  roles: RoleGrant[];
  /** Groups this user teaches — the scope of the TEACHER role. */
  taughtGroupIds: string[];
  isStudent: boolean;
  /** A temporary password is in use; only changing it is allowed until the user does. */
  mustChangePassword: boolean;
}
