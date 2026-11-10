import { z } from 'zod';
import type { Skill } from './content.js';

export interface Rubric {
  skill: Skill;
  name: string;
  criteria: readonly { key: string; label: string }[];
}

/**
 * Rubrics are versioned by key. A review stores the key it was scored with, so changing
 * the criteria means adding a new key, never editing an old one.
 */
export const RUBRICS = {
  IELTS_WRITING_V1: {
    skill: 'WRITING',
    name: 'IELTS Writing',
    criteria: [
      { key: 'TR', label: 'Task Achievement / Task Response' },
      { key: 'CC', label: 'Coherence and Cohesion' },
      { key: 'LR', label: 'Lexical Resource' },
      { key: 'GRA', label: 'Grammatical Range and Accuracy' },
    ],
  },
  IELTS_SPEAKING_V1: {
    skill: 'SPEAKING',
    name: 'IELTS Speaking',
    criteria: [
      { key: 'FC', label: 'Fluency and Coherence' },
      { key: 'LR', label: 'Lexical Resource' },
      { key: 'GRA', label: 'Grammatical Range and Accuracy' },
      { key: 'P', label: 'Pronunciation' },
    ],
  },
} as const satisfies Record<string, Rubric>;
export type RubricKey = keyof typeof RUBRICS;

export const CURRENT_RUBRIC: Partial<Record<Skill, RubricKey>> = {
  WRITING: 'IELTS_WRITING_V1',
  SPEAKING: 'IELTS_SPEAKING_V1',
};

/** An IELTS band: 0–9 in half-band steps. */
export const Band = z.number().min(0).max(9).multipleOf(0.5);

export const ScoreReviewRequest = z.object({
  /** One band per rubric criterion, keyed by criterion key. */
  criteria: z.record(z.string(), Band),
  comment: z.string().trim().max(5000).optional(),
  /** The specific next goal for the student. */
  nextStep: z.string().trim().max(1000).optional(),
});
export type ScoreReviewRequest = z.infer<typeof ScoreReviewRequest>;

export const ReviewQuery = z.object({ status: z.enum(['PENDING', 'DONE']).default('PENDING') });
export type ReviewQuery = z.infer<typeof ReviewQuery>;
