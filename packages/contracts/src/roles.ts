import { z } from 'zod';

/**
 * Staff roles are granted through role assignments, each with a scope:
 * - ADMINISTRATOR: whole centre (branchId is null)
 * - ACADEMIC_MANAGER: one branch
 * - TEACHER: the groups they are assigned to teach
 * STUDENT is implicit for users with a student profile and always means "self only".
 */
export const Role = z.enum(['ADMINISTRATOR', 'ACADEMIC_MANAGER', 'TEACHER', 'STUDENT']);
export type Role = z.infer<typeof Role>;

export const STAFF_ROLES = ['ADMINISTRATOR', 'ACADEMIC_MANAGER', 'TEACHER'] as const satisfies readonly Role[];
