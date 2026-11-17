import type { Principal } from './principal.js';

/**
 * The single place that decides what staff can see and change.
 * Pure functions: no database, no framework — so the rules are easy to test and audit.
 *
 *   ADMINISTRATOR     → whole centre
 *   ACADEMIC_MANAGER  → their branch(es)
 *   TEACHER           → the groups they teach
 *   student / no role → nothing through staff endpoints
 */
export type StaffScope =
  | { kind: 'center' }
  | { kind: 'scoped'; branchIds: string[]; groupIds: string[] }
  | { kind: 'none' };

export function staffScope(p: Principal): StaffScope {
  if (p.roles.some((r) => r.role === 'ADMINISTRATOR')) return { kind: 'center' };

  const branchIds = [
    ...new Set(
      p.roles.flatMap((r) => (r.role === 'ACADEMIC_MANAGER' && r.branchId ? [r.branchId] : [])),
    ),
  ];
  const groupIds = p.roles.some((r) => r.role === 'TEACHER') ? [...new Set(p.taughtGroupIds)] : [];

  if (branchIds.length === 0 && groupIds.length === 0) return { kind: 'none' };
  return { kind: 'scoped', branchIds, groupIds };
}

export function isStaff(p: Principal): boolean {
  return p.roles.some((r) => r.role !== 'STUDENT');
}

export type GroupFilter =
  | { centerId: string }
  | { centerId: string; OR: [{ branchId: { in: string[] } }, { id: { in: string[] } }] };

/** Filter for Group queries. `null` means: return nothing. */
export function groupFilter(p: Principal): GroupFilter | null {
  const scope = staffScope(p);
  if (scope.kind === 'none') return null;
  if (scope.kind === 'center') return { centerId: p.centerId };
  return {
    centerId: p.centerId,
    OR: [{ branchId: { in: scope.branchIds } }, { id: { in: scope.groupIds } }],
  };
}

export type BranchFilter =
  | { centerId: string }
  | {
      centerId: string;
      OR: [{ id: { in: string[] } }, { groups: { some: { id: { in: string[] } } } }];
    };

/** Filter for Branch queries: managed branches, plus branches containing a taught group. */
export function branchFilter(p: Principal): BranchFilter | null {
  const scope = staffScope(p);
  if (scope.kind === 'none') return null;
  if (scope.kind === 'center') return { centerId: p.centerId };
  return {
    centerId: p.centerId,
    OR: [{ id: { in: scope.branchIds } }, { groups: { some: { id: { in: scope.groupIds } } } }],
  };
}

/** Any staff member may draft content; it reaches students only after approval. */
export function canAuthorContent(p: Principal): boolean {
  return isStaff(p);
}

/** Approving, returning and retiring content is for administrators and academic managers. */
export function canApproveContent(p: Principal): boolean {
  return p.roles.some((r) => r.role === 'ADMINISTRATOR' || r.role === 'ACADEMIC_MANAGER');
}

/** Drafts are edited by their author, or by anyone who may approve content. */
export function canEditDraft(p: Principal, createdById: string): boolean {
  return p.userId === createdById || canApproveContent(p);
}

export type AssignmentFilter =
  | { centerId: string }
  | { centerId: string; OR: [{ group: GroupFilter }, { createdById: string }] };

/** Filter for Assignment queries: assignments for groups in scope, plus ones the caller made. */
export function assignmentFilter(p: Principal): AssignmentFilter | null {
  const groups = groupFilter(p);
  if (!groups) return null;
  if (!('OR' in groups)) return { centerId: p.centerId };
  return { centerId: p.centerId, OR: [{ group: groups }, { createdById: p.userId }] };
}

/** Creating or restructuring groups is a management action, never a teacher one. */
export function canManageGroupsInBranch(p: Principal, branchId: string): boolean {
  const managed = managedBranches(p);
  return managed === 'all' || managed.includes(branchId);
}

export function isAdministrator(p: Principal): boolean {
  return p.roles.some((r) => r.role === 'ADMINISTRATOR');
}

/** Staff accounts, roles and centre structure are administrator-only. */
export const canManageStaff = isAdministrator;

/**
 * Branches whose groups and students the caller may restructure, i.e. everything that is a
 * management action rather than a teaching one: 'all' for administrators, the managed
 * branches for academic managers, none for anyone else (teachers included).
 */
export function managedBranches(p: Principal): 'all' | string[] {
  if (isAdministrator(p)) return 'all';
  return [...new Set(p.roles.flatMap((r) => (r.role === 'ACADEMIC_MANAGER' && r.branchId ? [r.branchId] : [])))];
}

/** Whether the caller may create accounts, reset passwords or enrol students for anyone at all. */
export function canManageStudents(p: Principal): boolean {
  const managed = managedBranches(p);
  return managed === 'all' || managed.length > 0;
}
