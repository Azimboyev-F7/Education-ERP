import { z } from 'zod';
import { AttemptStatus } from '../attempts.js';
import { Skill } from '../content.js';
import { IsoDateTime, named } from './common.js';

export const AttemptSource = named('AttemptSource', z.enum(['ASSIGNMENT', 'SELF_PRACTICE']));

export const AttemptStarted = named('AttemptStarted', z.object({ id: z.string(), resumed: z.boolean() }));

export const AutosaveResult = named(
  'AutosaveResult',
  z.object({ saved: z.number().int(), serverNow: IsoDateTime, deadlineAt: IsoDateTime.nullable() }),
);

// ───────────── the attempt as a student sees it ─────────────

const StimulusView = z.object({
  id: z.string(),
  kind: z.enum(['PASSAGE', 'AUDIO', 'IMAGE', 'CUE_CARD']),
  title: z.string().nullable(),
  text: z.string().nullable(),
  fileKey: z.string().nullable(),
  /** Only after the attempt has been handed in. */
  transcript: z.string().nullable().optional(),
});

const QuestionView = z.object({
  id: z.string(),
  number: z.number().int(),
  prompt: z.unknown(),
  points: z.number().int(),
  /** Only after the attempt has been handed in. */
  answerKey: z.unknown().optional(),
  /** Only after the attempt has been handed in. */
  explanation: z.string().nullable().optional(),
});

const StudentContent = z.object({
  versionId: z.string(),
  title: z.string(),
  skill: Skill.nullable(),
  timeLimitSec: z.number().int().nullable(),
  sections: z.array(
    z.object({
      id: z.string(),
      skill: Skill,
      kind: z.string(),
      title: z.string().nullable(),
      instructions: z.string().nullable(),
      stimuli: z.array(StimulusView),
      groups: z.array(
        z.object({
          id: z.string(),
          type: z.string(),
          instructions: z.string().nullable(),
          config: z.unknown(),
          stimulusId: z.string().nullable(),
          questions: z.array(QuestionView),
        }),
      ),
    }),
  ),
});

const ReviewOutcome = z.object({
  status: z.enum(['PENDING', 'DONE']),
  rubricKey: z.string().optional(),
  criteria: z.record(z.string(), z.number()).nullable().optional(),
  overallBand: z.number().nullable().optional(),
  comment: z.string().nullable().optional(),
  nextStep: z.string().nullable().optional(),
});

const ResponseView = z.object({
  questionId: z.string(),
  answer: z.unknown(),
  timeSpentMs: z.number().int(),
  /** Marks and feedback appear only after the attempt has been handed in. */
  isCorrect: z.boolean().nullable().optional(),
  score: z.number().nullable().optional(),
  maxScore: z.number().nullable().optional(),
  review: ReviewOutcome.nullable().optional(),
});

/**
 * An attempt. While it is in progress the student sees the questions and their own saved
 * answers only; answer keys, explanations, marks and the band estimate arrive once it is handed in.
 */
export const AttemptView = named(
  'AttemptView',
  z.object({
    id: z.string(),
    studentId: z.string(),
    status: AttemptStatus,
    source: AttemptSource,
    timed: z.boolean(),
    startedAt: IsoDateTime,
    deadlineAt: IsoDateTime.nullable(),
    submittedAt: IsoDateTime.nullable(),
    /** Clients count down against this rather than their own clock. */
    serverNow: IsoDateTime,
    score: z.number().nullable().optional(),
    maxScore: z.number().nullable().optional(),
    /** A practice estimate from a full-length timed test — never an official IELTS result. */
    bandEstimate: z.number().nullable().optional(),
    bandIsEstimate: z.literal(true).optional(),
    content: StudentContent,
    responses: z.array(ResponseView),
  }),
);
export type AttemptView = z.infer<typeof AttemptView>;

export const MyAttempt = named(
  'MyAttempt',
  z.object({
    id: z.string(),
    title: z.string(),
    skill: Skill.nullable(),
    source: AttemptSource,
    status: AttemptStatus,
    startedAt: IsoDateTime,
    submittedAt: IsoDateTime.nullable(),
    score: z.number().nullable(),
    maxScore: z.number().nullable(),
  }),
);
export type MyAttempt = z.infer<typeof MyAttempt>;
export const MyAttemptList = z.array(MyAttempt);

export const PracticeItem = named(
  'PracticeItem',
  z.object({
    versionId: z.string(),
    title: z.string(),
    skill: Skill.nullable(),
    difficulty: z.number().int().nullable(),
    timeLimitSec: z.number().int().nullable(),
    fullLength: z.boolean(),
    tags: z.array(z.string()),
  }),
);
export type PracticeItem = z.infer<typeof PracticeItem>;
export const PracticeCatalog = z.array(PracticeItem);
