import { z } from 'zod';
import { Skill } from './content.js';

export const AttemptStatus = z.enum(['IN_PROGRESS', 'AWAITING_REVIEW', 'COMPLETED']).meta({ id: 'AttemptStatus' });
export type AttemptStatus = z.infer<typeof AttemptStatus>;

/** Start assigned work (by recipient) or self-chosen practice (by published version). */
export const StartAttemptRequest = z.union([
  z.object({ recipientId: z.string().min(1) }).strict(),
  z.object({ versionId: z.string().min(1), timed: z.boolean().default(false) }).strict(),
]);
export type StartAttemptRequest = z.infer<typeof StartAttemptRequest>;

export const SaveResponsesRequest = z.object({
  responses: z
    .array(
      z.object({
        questionId: z.string().min(1),
        /** Shape depends on the question type; validated against the registry in @erp/scoring. */
        answer: z.unknown(),
        /** Cumulative time the student has spent on this question. */
        timeSpentMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type SaveResponsesRequest = z.infer<typeof SaveResponsesRequest>;

export const PracticeQuery = z.object({ skill: Skill.optional() });
export type PracticeQuery = z.infer<typeof PracticeQuery>;
