import { describe, expect, it } from 'vitest';
import { branchFilter, canManageGroupsInBranch, groupFilter, isStaff, staffScope } from './access.policy.js';
import type { Principal } from './principal.js';

const base: Principal = {
  userId: 'u1',
  centerId: 'c1',
  username: 'x',
  fullName: 'X',
  roles: [],
  taughtGroupIds: [],
  isStudent: false,
};

const admin: Principal = { ...base, roles: [{ role: 'ADMINISTRATOR', branchId: null }] };
const manager: Principal = { ...base, roles: [{ role: 'ACADEMIC_MANAGER', branchId: 'b1' }] };
const teacher: Principal = { ...base, roles: [{ role: 'TEACHER', branchId: null }], taughtGroupIds: ['g1', 'g2'] };
const student: Principal = { ...base, isStudent: true };

describe('staffScope', () => {
  it('gives administrators the whole centre', () => {
    expect(staffScope(admin)).toEqual({ kind: 'center' });
  });
  it('limits managers to their branches', () => {
    expect(staffScope(manager)).toEqual({ kind: 'scoped', branchIds: ['b1'], groupIds: [] });
  });
  it('limits teachers to the groups they teach', () => {
    expect(staffScope(teacher)).toEqual({ kind: 'scoped', branchIds: [], groupIds: ['g1', 'g2'] });
  });
  it('gives students and role-less users nothing', () => {
    expect(staffScope(student)).toEqual({ kind: 'none' });
    expect(isStaff(student)).toBe(false);
  });
  it('ignores taught groups when the TEACHER role has been removed', () => {
    expect(staffScope({ ...base, taughtGroupIds: ['g1'] })).toEqual({ kind: 'none' });
  });
  it('combines manager and teacher scopes', () => {
    const both: Principal = { ...manager, roles: [...manager.roles, ...teacher.roles], taughtGroupIds: ['g9'] };
    expect(staffScope(both)).toEqual({ kind: 'scoped', branchIds: ['b1'], groupIds: ['g9'] });
  });
});

describe('filters', () => {
  it('always pin queries to the centre', () => {
    for (const p of [admin, manager, teacher]) {
      expect(groupFilter(p)).toMatchObject({ centerId: 'c1' });
      expect(branchFilter(p)).toMatchObject({ centerId: 'c1' });
    }
  });
  it('return null (no rows) for non-staff', () => {
    expect(groupFilter(student)).toBeNull();
    expect(branchFilter(student)).toBeNull();
  });
});

describe('canManageGroupsInBranch', () => {
  it('allows administrators anywhere and managers in their own branch only', () => {
    expect(canManageGroupsInBranch(admin, 'b2')).toBe(true);
    expect(canManageGroupsInBranch(manager, 'b1')).toBe(true);
    expect(canManageGroupsInBranch(manager, 'b2')).toBe(false);
  });
  it('never allows teachers', () => {
    expect(canManageGroupsInBranch(teacher, 'b1')).toBe(false);
  });
});
