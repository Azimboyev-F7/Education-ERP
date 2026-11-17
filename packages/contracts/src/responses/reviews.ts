import { z } from 'zod';
import { Skill } from '../content.js';
import { IsoDateTime, named, PersonRef } from './common.js';

export const ReviewStatus = named('ReviewStatus', z.enum(['PENDING', 'DONE']));

export const ReviewQueueItem = named(
  'ReviewQueueItem',
  z.object({
    id: z.string(),
    student: PersonRef,
    skill: Skill,
    taskType: z.string(),
    status: ReviewStatus,
    createdAt: IsoDateTime,
    /** How long the student has been waiting for feedback. */
    waitingHours: z.number().int(),
    overallBand: z.number().nullable(),
  }),
);
export type ReviewQueueItem = z.infer<typeof ReviewQueueItem>;
export const ReviewQueue = z.array(ReviewQueueItem);

export const ReviewDetail = named(
  'ReviewDetail',
  z.object({
    id: z.string(),
    attemptId: z.string(),
    studentId: z.string(),
    skill: Skill,
    taskType: z.string(),
    status: ReviewStatus,
    createdAt: IsoDateTime,
    rubricKey: z.string(),
    /** The criteria to score; null only if the stored key is no longer known. */
    rubric: z
      .object({
        skill: Skill,
        name: z.string(),
        criteria: z.array(z.object({ key: z.string(), label: z.string() })),
      })
      .nullable(),
    prompt: z.unknown(),
    stimulus: z.object({ kind: z.string(), text: z.string().nullable(), fileKey: z.string().nullable() }).nullable(),
    answer: z.unknown(),
    timeSpentMs: z.number().int(),
    /** Present once the review is done. */
    result: z
      .object({
        criteria: z.record(z.string(), z.number()).nullable(),
        overallBand: z.number().nullable(),
        comment: z.string().nullable(),
        nextStep: z.string().nullable(),
        reviewerId: z.string().nullable(),
        completedAt: IsoDateTime.nullable(),
      })
      .nullable(),
  }),
);
export type ReviewDetail = z.infer<typeof ReviewDetail>;

export const ReviewScored = named('ReviewScored', z.object({ overallBand: z.number() }));
