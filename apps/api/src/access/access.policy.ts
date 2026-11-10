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

/** Creating or restructuring groups is a management action, never a teacher one. */
export function canManageGroupsInBranch(p: Principal, branchId: string): boolean {
  const scope = staffScope(p);
  if (scope.kind === 'center') return true;
  return scope.kind === 'scoped' && scope.branchIds.includes(branchId);
}
