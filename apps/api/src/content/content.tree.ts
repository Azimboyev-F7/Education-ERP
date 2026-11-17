import { questionType } from '@erp/scoring';
import type { Prisma } from '../generated/prisma/client.js';

/** The include that loads a version with its whole ordered content tree. */
export const versionTree = {
  taskSet: { select: { id: true, title: true, skill: true, centerId: true } },
  sections: {
    orderBy: { position: 'asc' },
    include: {
      stimuli: { orderBy: { position: 'asc' } },
      groups: {
        orderBy: { position: 'asc' },
        include: { questions: { orderBy: { position: 'asc' } } },
      },
    },
  },
} as const satisfies Prisma.TaskSetVersionInclude;

export type VersionTree = Prisma.TaskSetVersionGetPayload<{ include: typeof versionTree }>;
type TreeQuestion = VersionTree['sections'][number]['groups'][number]['questions'][number];

export interface FlatQuestion {
  question: TreeQuestion;
  type: string;
  config: unknown;
  manual: boolean;
  skill: VersionTree['sections'][number]['skill'];
  sectionKind: string;
}

/** Every question of a version with the context needed to validate and score a response. */
export function flattenQuestions(tree: VersionTree): FlatQuestion[] {
  return tree.sections.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.questions.map((question) => ({
        question,
        type: group.type,
        config: group.config,
        manual: questionType(group.type)?.manual ?? false,
        skill: section.skill,
        sectionKind: section.kind,
      })),
    ),
  );
}

/**
 * The staff view of a version, answer keys included. Spelled out field by field so storage
 * details (the owning centre, positions, publisher) never reach a client by accident.
 */
export function toVersionDetail(tree: VersionTree) {
  return {
    id: tree.id,
    number: tree.number,
    status: tree.status,
    difficulty: tree.difficulty,
    timeLimitSec: tree.timeLimitSec,
    fullLength: tree.fullLength,
    module: tree.module,
    tags: tree.tags,
    createdById: tree.createdById,
    createdAt: tree.createdAt,
    publishedAt: tree.publishedAt,
    retiredAt: tree.retiredAt,
    taskSet: { id: tree.taskSet.id, title: tree.taskSet.title, skill: tree.taskSet.skill },
    sections: tree.sections.map((section) => ({
      id: section.id,
      skill: section.skill,
      kind: section.kind,
      title: section.title,
      instructions: section.instructions,
      stimuli: section.stimuli.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        text: s.text,
        fileKey: s.fileKey,
        transcript: s.transcript,
      })),
      groups: section.groups.map((group) => ({
        id: group.id,
        type: group.type,
        instructions: group.instructions,
        config: group.config,
        stimulusId: group.stimulusId,
        questions: group.questions.map((q) => ({
          id: q.id,
          number: q.number,
          prompt: q.prompt,
          answerKey: q.answerKey,
          explanation: q.explanation,
          points: q.points,
        })),
      })),
    })),
  };
}

/**
 * The content as a student may see it. Answer keys, explanations and transcripts are
 * included only when `reveal` is true, i.e. after the attempt has been submitted.
 */
export function toStudentView(tree: VersionTree, reveal: boolean) {
  return {
    versionId: tree.id,
    title: tree.taskSet.title,
    skill: tree.taskSet.skill,
    timeLimitSec: tree.timeLimitSec,
    sections: tree.sections.map((section) => ({
      id: section.id,
      skill: section.skill,
      kind: section.kind,
      title: section.title,
      instructions: section.instructions,
      stimuli: section.stimuli.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        text: s.text,
        fileKey: s.fileKey,
        ...(reveal ? { transcript: s.transcript } : {}),
      })),
      groups: section.groups.map((group) => ({
        id: group.id,
        type: group.type,
        instructions: group.instructions,
        config: group.config,
        stimulusId: group.stimulusId,
        questions: group.questions.map((q) => ({
          id: q.id,
          number: q.number,
          prompt: q.prompt,
          points: q.points,
          ...(reveal ? { answerKey: q.answerKey, explanation: q.explanation } : {}),
        })),
      })),
    })),
  };
}
