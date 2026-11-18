import { z } from 'zod';
import { RecipientStatus } from '../assignments.js';
import { Skill } from '../content.js';
import { IsoDateTime, named, PersonRef } from './common.js';
import { AssignmentCore } from './assignments.js';

export const EvidenceKind = named('EvidenceKind', z.enum(['AUTO_SCORED', 'TEACHER_ASSESSED', 'OFFICIAL_RESULT']));

export const Completion = named(
  'Completion',
  z.object({
    assigned: z.number().int(),
    completed: z.number().int(),
    awaitingReview: z.number().int(),
    open: z.number().int(),
    overdue: z.number().int(),
  }),
);

const EvidenceWindow = z.object({
  /** Pieces of evidence in the window. A trend needs several; the UI should say so when it is low. */
  count: z.number().int(),
  /** Accuracy 0–1 for auto-scored evidence, mean band for teacher-assessed evidence. */
  value: z.number().nullable(),
});

/** Performance on one skill and task type. Auto-scored accuracy and teacher bands are never merged. */
export const SkillSummary = named(
  'SkillSummary',
  z.object({
    skill: Skill,
    taskType: z.string(),
    kind: EvidenceKind,
    measure: z.enum(['accuracy', 'band']),
    all: EvidenceWindow,
    /** The last 30 days. */
    recent: EvidenceWindow,
    /** The 30 days before that, for comparison. */
    previous: EvidenceWindow,
    lastAt: IsoDateTime,
  }),
);
export type SkillSummary = z.infer<typeof SkillSummary>;

export const StudentAnalytics = named(
  'StudentAnalytics',
  z.object({
    student: z.object({
      id: z.string(),
      fullName: z.string(),
      targetBand: z.number().nullable(),
      examDate: IsoDateTime.nullable(),
    }),
    completion: Completion,
    skills: z.array(SkillSummary),
    /** Practice estimates from full-length timed tests. Not official IELTS results. */
    bandEstimates: z.array(
      z.object({
        attemptId: z.string(),
        skill: Skill.nullable(),
        title: z.string(),
        band: z.number(),
        submittedAt: IsoDateTime,
        isEstimate: z.literal(true),
      }),
    ),
  }),
);
export type StudentAnalytics = z.infer<typeof StudentAnalytics>;

export const GroupAnalytics = named(
  'GroupAnalytics',
  z.object({
    group: z.object({ id: z.string(), name: z.string(), branchId: z.string() }),
    completion: Completion,
    skills: z.array(SkillSummary),
    students: z.array(
      PersonRef.extend({
        completion: Completion,
        /** Pooled accuracy on auto-scored work; null when there is no evidence yet. */
        accuracy: z.number().nullable(),
        evidenceCount: z.number().int(),
      }),
    ),
  }),
);
export type GroupAnalytics = z.infer<typeof GroupAnalytics>;

export const AssignmentReport = named(
  'AssignmentReport',
  z.object({
    assignment: AssignmentCore,
    /** Recipients who have handed in at least one attempt. */
    submitted: z.number().int(),
    /** Pooled accuracy on auto-scored questions across handed-in attempts. */
    accuracy: z.number().nullable(),
    questions: z.array(
      z.object({
        questionId: z.string(),
        number: z.number().int(),
        skill: Skill,
        type: z.string(),
        correct: z.number().int(),
        total: z.number().int(),
        accuracy: z.number().nullable(),
      }),
    ),
    students: z.array(
      z.object({
        student: PersonRef,
        status: RecipientStatus,
        overdue: z.boolean(),
        attemptId: z.string().nullable(),
        score: z.number().nullable(),
        maxScore: z.number().nullable(),
        bandEstimate: z.number().nullable(),
        submittedAt: IsoDateTime.nullable(),
      }),
    ),
  }),
);
export type AssignmentReport = z.infer<typeof AssignmentReport>;
