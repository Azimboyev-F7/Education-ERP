import { z } from 'zod';

export const Skill = z.enum(['LISTENING', 'READING', 'WRITING', 'SPEAKING']).meta({ id: 'Skill' });
export type Skill = z.infer<typeof Skill>;

export const ContentStatus = z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'RETIRED']).meta({ id: 'ContentStatus' });
export type ContentStatus = z.infer<typeof ContentStatus>;

export const IeltsModule = z.enum(['ACADEMIC', 'GENERAL']).meta({ id: 'IeltsModule' });
export type IeltsModule = z.infer<typeof IeltsModule>;

/** The parts of the IELTS test a section can represent, per skill. */
export const SECTION_KINDS = {
  LISTENING: ['LISTENING_PART_1', 'LISTENING_PART_2', 'LISTENING_PART_3', 'LISTENING_PART_4'],
  READING: ['READING_PASSAGE_1', 'READING_PASSAGE_2', 'READING_PASSAGE_3'],
  WRITING: ['WRITING_TASK_1', 'WRITING_TASK_2'],
  SPEAKING: ['SPEAKING_PART_1', 'SPEAKING_PART_2', 'SPEAKING_PART_3'],
} as const satisfies Record<Skill, readonly string[]>;

const text = (max: number) => z.string().trim().min(1).max(max);

export const QuestionInput = z.object({
  /** Number shown to the student; unique within the version. */
  number: z.number().int().min(1).max(200),
  /** Shape depends on the question type; validated against the registry in @erp/scoring. */
  prompt: z.unknown(),
  answerKey: z.unknown().optional(),
  explanation: text(4000).optional(),
  points: z.number().int().min(1).max(10).default(1),
});
export type QuestionInput = z.infer<typeof QuestionInput>;

export const QuestionGroupInput = z.object({
  type: text(64),
  instructions: text(2000).optional(),
  config: z.unknown().default({}),
  /** Index into the section's `stimuli` this group refers to. */
  stimulusIndex: z.number().int().min(0).optional(),
  questions: z.array(QuestionInput).min(1).max(60),
});
export type QuestionGroupInput = z.infer<typeof QuestionGroupInput>;

export const StimulusInput = z.object({
  kind: z.enum(['PASSAGE', 'AUDIO', 'IMAGE', 'CUE_CARD']),
  title: text(300).optional(),
  text: text(40_000).optional(),
  fileKey: text(500).optional(),
  transcript: text(40_000).optional(),
});
export type StimulusInput = z.infer<typeof StimulusInput>;

export const SectionInput = z.object({
  skill: Skill,
  kind: text(64),
  title: text(300).optional(),
  instructions: text(4000).optional(),
  stimuli: z.array(StimulusInput).max(10).default([]),
  groups: z.array(QuestionGroupInput).min(1).max(20),
});
export type SectionInput = z.infer<typeof SectionInput>;

/** The whole editable body of a draft version, saved as one document. */
export const VersionContentInput = z.object({
  difficulty: z.number().int().min(1).max(5).optional(),
  timeLimitSec: z.number().int().min(30).max(4 * 60 * 60).optional(),
  fullLength: z.boolean().default(false),
  module: IeltsModule.optional(),
  tags: z.array(text(80)).max(30).default([]),
  sections: z.array(SectionInput).min(1).max(12),
});
export type VersionContentInput = z.infer<typeof VersionContentInput>;

export const CreateTaskSetRequest = z.object({
  title: text(200),
  skill: Skill.nullable().default(null),
});
export type CreateTaskSetRequest = z.infer<typeof CreateTaskSetRequest>;

export const TaskSetQuery = z.object({
  skill: Skill.optional(),
  status: ContentStatus.optional(),
  q: z.string().trim().max(100).optional(),
});
export type TaskSetQuery = z.infer<typeof TaskSetQuery>;
