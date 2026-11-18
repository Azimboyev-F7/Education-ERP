import { z } from 'zod';
import { ContentStatus, IeltsModule, Skill } from '../content.js';
import { IsoDateTime, named } from './common.js';

const VersionBrief = named(
  'VersionBrief',
  z.object({
    id: z.string(),
    number: z.number().int(),
    status: ContentStatus,
    difficulty: z.number().int().nullable(),
    tags: z.array(z.string()),
    publishedAt: IsoDateTime.nullable(),
  }),
);

export const TaskSetListItem = named(
  'TaskSetListItem',
  z.object({
    id: z.string(),
    title: z.string(),
    skill: Skill.nullable(),
    createdById: z.string(),
    latest: VersionBrief.nullable(),
    /** The version students can currently be given. */
    published: VersionBrief.nullable(),
  }),
);
export type TaskSetListItem = z.infer<typeof TaskSetListItem>;
export const TaskSetList = z.array(TaskSetListItem);

export const TaskSetCreated = named('TaskSetCreated', z.object({ id: z.string(), versionId: z.string() }));
export const NewVersionCreated = named('NewVersionCreated', z.object({ versionId: z.string() }));

// ───────────── the staff view of a version, including answer keys ─────────────

const StimulusDetail = z.object({
  id: z.string(),
  kind: z.enum(['PASSAGE', 'AUDIO', 'IMAGE', 'CUE_CARD']),
  title: z.string().nullable(),
  text: z.string().nullable(),
  fileKey: z.string().nullable(),
  transcript: z.string().nullable(),
});

const QuestionDetail = z.object({
  id: z.string(),
  number: z.number().int(),
  prompt: z.unknown(),
  answerKey: z.unknown(),
  explanation: z.string().nullable(),
  points: z.number().int(),
});

const GroupDetail = z.object({
  id: z.string(),
  type: z.string(),
  instructions: z.string().nullable(),
  config: z.unknown(),
  stimulusId: z.string().nullable(),
  questions: z.array(QuestionDetail),
});

const SectionDetail = z.object({
  id: z.string(),
  skill: Skill,
  kind: z.string(),
  title: z.string().nullable(),
  instructions: z.string().nullable(),
  stimuli: z.array(StimulusDetail),
  groups: z.array(GroupDetail),
});

export const VersionDetail = named(
  'VersionDetail',
  z.object({
    id: z.string(),
    number: z.number().int(),
    status: ContentStatus,
    difficulty: z.number().int().nullable(),
    timeLimitSec: z.number().int().nullable(),
    fullLength: z.boolean(),
    module: IeltsModule.nullable(),
    tags: z.array(z.string()),
    createdById: z.string(),
    createdAt: IsoDateTime,
    publishedAt: IsoDateTime.nullable(),
    retiredAt: IsoDateTime.nullable(),
    taskSet: z.object({ id: z.string(), title: z.string(), skill: Skill.nullable() }),
    sections: z.array(SectionDetail),
  }),
);
export type VersionDetail = z.infer<typeof VersionDetail>;
