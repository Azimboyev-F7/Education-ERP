import { describe, expect, it } from 'vitest';
import { type EvidenceRow, summarise } from './summarise.js';

const now = new Date('2026-11-10T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const row = (over: Partial<EvidenceRow>): EvidenceRow => ({
  skill: 'READING',
  taskType: 'TRUE_FALSE_NOT_GIVEN',
  kind: 'AUTO_SCORED',
  score: 0,
  maxScore: 10,
  band: null,
  occurredAt: daysAgo(1),
  ...over,
});

describe('summarise', () => {
  it('pools accuracy by total points, not by averaging percentages', () => {
    const [summary] = summarise([row({ score: 1, maxScore: 2 }), row({ score: 8, maxScore: 8 })], now);
    expect(summary).toMatchObject({ measure: 'accuracy', all: { count: 2, value: 0.9 } });
  });

  it('compares the last 30 days with the 30 days before', () => {
    const [summary] = summarise(
      [row({ score: 8, occurredAt: daysAgo(5) }), row({ score: 4, occurredAt: daysAgo(40) }), row({ score: 0, occurredAt: daysAgo(90) })],
      now,
    );
    expect(summary?.recent).toEqual({ count: 1, value: 0.8 });
    expect(summary?.previous).toEqual({ count: 1, value: 0.4 });
    expect(summary?.all.count).toBe(3);
  });

  it('keeps auto-scored and teacher-assessed evidence apart', () => {
    const summaries = summarise(
      [
        row({ skill: 'WRITING', taskType: 'WRITING_TASK_2', kind: 'TEACHER_ASSESSED', score: 6.5, maxScore: 9, band: 6.5 }),
        row({ skill: 'WRITING', taskType: 'WRITING_TASK_2', kind: 'TEACHER_ASSESSED', score: 5.5, maxScore: 9, band: 5.5 }),
        row({ score: 5 }),
      ],
      now,
    );
    expect(summaries).toHaveLength(2);
    expect(summaries.find((s) => s.kind === 'TEACHER_ASSESSED')).toMatchObject({ measure: 'band', all: { count: 2, value: 6 } });
  });

  it('reports no value for an empty window', () => {
    const [summary] = summarise([row({ occurredAt: daysAgo(45) })], now);
    expect(summary?.recent).toEqual({ count: 0, value: null });
  });
});
