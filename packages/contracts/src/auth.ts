import { z } from 'zod';
import { Role } from './roles.js';

export const LoginRequest = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const RoleGrant = z.object({
  role: Role,
  branchId: z.string().nullable(),
});
export type RoleGrant = z.infer<typeof RoleGrant>;

export const Me = z.object({
  id: z.string(),
  centerId: z.string(),
  username: z.string(),
  fullName: z.string(),
  roles: z.array(RoleGrant),
  isStudent: z.boolean(),
});
export type Me = z.infer<typeof Me>;
