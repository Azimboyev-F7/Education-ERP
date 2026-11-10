import { z } from 'zod';
import { matchesAnswer } from './normalize.js';

/**
 * The question-type registry. Each type declares the shape of its group config, question
 * prompt, answer key and student response, plus how a response is scored.
 * Adding a type (or another exam's types) means adding an entry here; the content library,
 * attempt engine and evidence pipeline never branch on a specific type.
 */
export interface ScoreResult {
  isCorrect: boolean;
  score: number;
}

export interface QuestionTypeDef {
  /** Marked by a teacher with a rubric instead of an answer key. */
  manual: boolean;
  config: z.ZodType;
  prompt: z.ZodType;
  answerKey: z.ZodType | null;
  response: z.ZodType;
  /** Cross-field authoring check; returns a problem description or null. */
  check?(parts: { config: any; prompt: any; answerKey: any }): string | null;
  score?(parts: { config: any; answerKey: any; response: any; points: number }): ScoreResult;
}

const allOrNothing = (isCorrect: boolean, points: number): ScoreResult => ({
  isCorrect,
  score: isCorrect ? points : 0,
});

const option = z.object({ id: z.string().min(1).max(8), text: z.string().min(1).max(1000) });
const uniqueIds = (items: { id: string }[]) => new Set(items.map((i) => i.id)).size === items.length;

const multipleChoice: QuestionTypeDef = {
  manual: false,
  config: z.object({}).default({}),
  prompt: z.object({
    stem: z.string().min(1).max(2000),
    options: z.array(option).min(2).max(10).refine(uniqueIds, 'Option ids must be unique'),
  }),
  answerKey: z.object({ correct: z.array(z.string()).min(1).max(10) }),
  response: z.object({ selected: z.array(z.string()).max(10) }),
  check({ prompt, answerKey }) {
    const ids = new Set<string>(prompt.options.map((o: { id: string }) => o.id));
    return answerKey.correct.every((id: string) => ids.has(id)) ? null : 'The answer key names an unknown option';
  },
  score({ answerKey, response, points }) {
    const correct = new Set<string>(answerKey.correct);
    const selected = new Set<string>(response.selected);
    return allOrNothing(correct.size === selected.size && [...correct].every((id) => selected.has(id)), points);
  },
};

const tfng = z.enum(['TRUE', 'FALSE', 'NOT_GIVEN']);
const trueFalseNotGiven: QuestionTypeDef = {
  manual: false,
  config: z.object({}).default({}),
  prompt: z.object({ statement: z.string().min(1).max(2000) }),
  answerKey: z.object({ value: tfng }),
  response: z.object({ value: tfng }),
  score: ({ answerKey, response, points }) => allOrNothing(answerKey.value === response.value, points),
};

const matchingHeadings: QuestionTypeDef = {
  manual: false,
  config: z.object({
    headings: z.array(option).min(2).max(20).refine(uniqueIds, 'Heading ids must be unique'),
  }),
  prompt: z.object({ paragraph: z.string().min(1).max(40) }),
  answerKey: z.object({ headingId: z.string().min(1) }),
  response: z.object({ headingId: z.string().min(1) }),
  check({ config, answerKey }) {
    return config.headings.some((h: { id: string }) => h.id === answerKey.headingId)
      ? null
      : 'The answer key names an unknown heading';
  },
  score: ({ answerKey, response, points }) => allOrNothing(answerKey.headingId === response.headingId, points),
};

const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

/** Sentence completion, summary completion and short answer all take a typed answer. */
const typedAnswer: QuestionTypeDef = {
  manual: false,
  config: z.object({ maxWords: z.number().int().min(1).max(10).optional() }).default({}),
  prompt: z.object({ text: z.string().min(1).max(2000) }),
  answerKey: z.object({ accepted: z.array(z.string().trim().min(1).max(200)).min(1).max(20) }),
  response: z.object({ text: z.string().max(200) }),
  check({ config, answerKey }) {
    const limit: number | undefined = config.maxWords;
    return limit !== undefined && answerKey.accepted.some((a: string) => wordCount(a) > limit)
      ? 'An accepted answer is longer than the word limit'
      : null;
  },
  score({ config, answerKey, response, points }) {
    const withinLimit = config.maxWords === undefined || wordCount(response.text) <= config.maxWords;
    return allOrNothing(withinLimit && matchesAnswer(response.text, answerKey.accepted), points);
  },
};

const essay: QuestionTypeDef = {
  manual: true,
  config: z.object({ minWords: z.number().int().min(1).max(1000).optional() }).default({}),
  prompt: z.object({ text: z.string().min(1).max(8000) }),
  answerKey: null,
  response: z.object({ text: z.string().max(30_000) }),
};

const speakingPrompt: QuestionTypeDef = {
  manual: true,
  config: z.object({}).default({}),
  prompt: z.object({ text: z.string().min(1).max(4000) }),
  answerKey: null,
  // Audio capture is deliberately out of scope until the centre approves it; the student
  // marks the task as done and may leave notes for the teacher.
  response: z.object({ completed: z.literal(true), notes: z.string().max(4000).optional() }),
};

export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: multipleChoice,
  TRUE_FALSE_NOT_GIVEN: trueFalseNotGiven,
  MATCHING_HEADINGS: matchingHeadings,
  SENTENCE_COMPLETION: typedAnswer,
  SUMMARY_COMPLETION: typedAnswer,
  SHORT_ANSWER: typedAnswer,
  ESSAY: essay,
  SPEAKING_PROMPT: speakingPrompt,
} as const satisfies Record<string, QuestionTypeDef>;

export type QuestionType = keyof typeof QUESTION_TYPES;

export function questionType(type: string): QuestionTypeDef | null {
  return Object.hasOwn(QUESTION_TYPES, type) ? QUESTION_TYPES[type as QuestionType] : null;
}

const firstIssue = (error: z.ZodError) => {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'value'}: ${issue.message}` : 'invalid';
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };

/** Validates and normalises a group's config at authoring time. */
export function parseGroupConfig(type: string, config: unknown): Parsed<unknown> {
  const def = questionType(type);
  if (!def) return { ok: false, problem: `Unknown question type "${type}"` };
  const result = def.config.safeParse(config ?? {});
  return result.success ? { ok: true, value: result.data } : { ok: false, problem: `config ${firstIssue(result.error)}` };
}

/** Validates one authored question against its type. `config` must already be parsed. */
export function parseQuestion(
  type: string,
  config: unknown,
  prompt: unknown,
  answerKey: unknown,
): Parsed<{ prompt: unknown; answerKey: unknown }> {
  const def = questionType(type);
  if (!def) return { ok: false, problem: `Unknown question type "${type}"` };

  const parsedPrompt = def.prompt.safeParse(prompt);
  if (!parsedPrompt.success) return { ok: false, problem: `prompt ${firstIssue(parsedPrompt.error)}` };

  if (!def.answerKey) {
    if (answerKey !== undefined && answerKey !== null) {
      return { ok: false, problem: 'Teacher-marked questions have no answer key' };
    }
    return { ok: true, value: { prompt: parsedPrompt.data, answerKey: null } };
  }

  const parsedKey = def.answerKey.safeParse(answerKey);
  if (!parsedKey.success) return { ok: false, problem: `answerKey ${firstIssue(parsedKey.error)}` };

  const problem = def.check?.({ config, prompt: parsedPrompt.data, answerKey: parsedKey.data }) ?? null;
  return problem ? { ok: false, problem } : { ok: true, value: { prompt: parsedPrompt.data, answerKey: parsedKey.data } };
}

/** Validates a student's answer shape. Does not score it. */
export function parseResponse(type: string, answer: unknown): Parsed<unknown> {
  const def = questionType(type);
  if (!def) return { ok: false, problem: `Unknown question type "${type}"` };
  const result = def.response.safeParse(answer);
  return result.success ? { ok: true, value: result.data } : { ok: false, problem: firstIssue(result.error) };
}

/**
 * Scores a stored response to an auto-marked question.
 * A response that no longer parses (or a missing one) scores zero rather than throwing.
 */
export function scoreResponse(
  type: string,
  config: unknown,
  answerKey: unknown,
  answer: unknown,
  points: number,
): ScoreResult {
  const def = questionType(type);
  if (!def || def.manual || !def.score) throw new Error(`"${type}" is not an auto-scored question type`);
  const response = def.response.safeParse(answer);
  if (!response.success) return { isCorrect: false, score: 0 };
  return def.score({ config, answerKey, response: response.data, points });
}
