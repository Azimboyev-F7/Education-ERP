import { z } from 'zod';

export const BranchSummary = z.object({ id: z.string(), name: z.string() }).meta({ id: 'BranchSummary' });
export type BranchSummary = z.infer<typeof BranchSummary>;

export const GroupSummary = z.object({
  id: z.string(),
  name: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  courseName: z.string(),
  levelName: z.string().nullable(),
  studentCount: z.number().int(),
}).meta({ id: 'GroupSummary' });
export type GroupSummary = z.infer<typeof GroupSummary>;

export const StudentSummary = z.object({
  id: z.string(),
  fullName: z.string(),
  username: z.string(),
  targetBand: z.number().nullable(),
  groups: z.array(z.object({ id: z.string(), name: z.string() })),
}).meta({ id: 'StudentSummary' });
export type StudentSummary = z.infer<typeof StudentSummary>;

export const CreateGroupRequest = z.object({
  name: z.string().trim().min(1).max(120),
  branchId: z.string().min(1),
  courseId: z.string().min(1),
  levelId: z.string().min(1).optional(),
  periodId: z.string().min(1).optional(),
});
export type CreateGroupRequest = z.infer<typeof CreateGroupRequest>;
