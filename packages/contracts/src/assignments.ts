import { z } from 'zod';

export const AssignmentKind = z.enum(['CLASSWORK', 'HOMEWORK', 'LEVEL_CHECK', 'EXAM']).meta({ id: 'AssignmentKind' });
export type AssignmentKind = z.infer<typeof AssignmentKind>;

export const RecipientStatus = z.enum(['ASSIGNED', 'STARTED', 'AWAITING_REVIEW', 'COMPLETED', 'EXCUSED']).meta({ id: 'RecipientStatus' });
export type RecipientStatus = z.infer<typeof RecipientStatus>;

export const CreateAssignmentRequest = z
  .object({
    versionId: z.string().min(1),
    kind: AssignmentKind,
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().max(4000).optional(),
    /** Assign to everyone currently enrolled in this group… */
    groupId: z.string().min(1).optional(),
    /** …and/or to these individual students. */
    studentIds: z.array(z.string().min(1)).max(500).default([]),
    opensAt: z.coerce.date().optional(),
    dueAt: z.coerce.date().optional(),
    /** Overrides the task set's own time limit. */
    timeLimitSec: z.number().int().min(30).max(4 * 60 * 60).optional(),
    maxAttempts: z.number().int().min(1).max(10).default(1),
  })
  .refine((v) => v.groupId !== undefined || v.studentIds.length > 0, {
    message: 'Choose a group or at least one student',
    path: ['groupId'],
  })
  .refine((v) => !v.opensAt || !v.dueAt || v.opensAt < v.dueAt, {
    message: 'The due date must be after the opening date',
    path: ['dueAt'],
  });
export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentRequest>;

export const AssignmentQuery = z.object({ groupId: z.string().min(1).optional() });
export type AssignmentQuery = z.infer<typeof AssignmentQuery>;
