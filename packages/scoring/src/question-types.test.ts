import { describe, expect, it } from 'vitest';
import { estimateBand, overallBand } from './bands.js';
import { parseGroupConfig, parseQuestion, parseResponse, scoreResponse } from './question-types.js';

describe('authoring validation', () => {
  it('rejects unknown types', () => {
    expect(parseGroupConfig('NOPE', {})).toMatchObject({ ok: false });
  });

  it('rejects a multiple-choice key that names a missing option', () => {
    const prompt = { stem: 'Pick', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }] };
    expect(parseQuestion('MULTIPLE_CHOICE', {}, prompt, { correct: ['C'] })).toMatchObject({ ok: false });
    expect(parseQuestion('MULTIPLE_CHOICE', {}, prompt, { correct: ['B'] })).toMatchObject({ ok: true });
  });

  it('rejects an accepted answer longer than the word limit', () => {
    const result = parseQuestion('SENTENCE_COMPLETION', { maxWords: 2 }, { text: 'The ___' }, { accepted: ['one two three'] });
    expect(result).toMatchObject({ ok: false });
  });

  it('refuses an answer key on teacher-marked questions', () => {
    expect(parseQuestion('ESSAY', {}, { text: 'Discuss.' }, { accepted: ['x'] })).toMatchObject({ ok: false });
    expect(parseQuestion('ESSAY', {}, { text: 'Discuss.' }, undefined)).toEqual({
      ok: true,
      value: { prompt: { text: 'Discuss.' }, answerKey: null },
    });
  });
});

describe('scoring', () => {
  it('scores multiple choice all-or-nothing, ignoring order', () => {
    const key = { correct: ['A', 'C'] };
    expect(scoreResponse('MULTIPLE_CHOICE', {}, key, { selected: ['C', 'A'] }, 2)).toEqual({ isCorrect: true, score: 2 });
    expect(scoreResponse('MULTIPLE_CHOICE', {}, key, { selected: ['A'] }, 2)).toEqual({ isCorrect: false, score: 0 });
    expect(scoreResponse('MULTIPLE_CHOICE', {}, key, { selected: ['A', 'B', 'C'] }, 2).isCorrect).toBe(false);
  });

  it('scores True / False / Not Given', () => {
    expect(scoreResponse('TRUE_FALSE_NOT_GIVEN', {}, { value: 'NOT_GIVEN' }, { value: 'NOT_GIVEN' }, 1).isCorrect).toBe(true);
    expect(scoreResponse('TRUE_FALSE_NOT_GIVEN', {}, { value: 'NOT_GIVEN' }, { value: 'FALSE' }, 1).isCorrect).toBe(false);
  });

  it('scores matching headings', () => {
    expect(scoreResponse('MATCHING_HEADINGS', {}, { headingId: 'iv' }, { headingId: 'iv' }, 1).isCorrect).toBe(true);
  });

  it('scores typed answers with variants and enforces the word limit', () => {
    const key = { accepted: ['car park', 'parking lot'] };
    expect(scoreResponse('SHORT_ANSWER', { maxWords: 2 }, key, { text: ' Car  Park. ' }, 1).isCorrect).toBe(true);
    expect(scoreResponse('SHORT_ANSWER', { maxWords: 1 }, key, { text: 'car park' }, 1).isCorrect).toBe(false);
    expect(scoreResponse('SUMMARY_COMPLETION', {}, key, { text: 'garage' }, 1).isCorrect).toBe(false);
  });

  it('scores a malformed stored answer as zero instead of throwing', () => {
    expect(scoreResponse('SHORT_ANSWER', {}, { accepted: ['x'] }, { skipped: true }, 1)).toEqual({ isCorrect: false, score: 0 });
  });

  it('refuses to auto-score teacher-marked types', () => {
    expect(() => scoreResponse('ESSAY', {}, null, { text: 'hello' }, 1)).toThrow();
  });

  it('validates response shapes', () => {
    expect(parseResponse('TRUE_FALSE_NOT_GIVEN', { value: 'MAYBE' })).toMatchObject({ ok: false });
    expect(parseResponse('SPEAKING_PROMPT', { completed: true })).toMatchObject({ ok: true });
  });
});

describe('bands', () => {
  it('estimates Listening and Reading bands from a raw score', () => {
    expect(estimateBand('LISTENING', 'ACADEMIC', 40)).toBe(9);
    expect(estimateBand('LISTENING', 'ACADEMIC', 30)).toBe(7);
    expect(estimateBand('READING', 'ACADEMIC', 30)).toBe(7);
    expect(estimateBand('READING', 'GENERAL', 30)).toBe(6);
    expect(estimateBand('READING', 'ACADEMIC', 0)).toBe(0);
  });

  it('gives no estimate for impossible scores', () => {
    expect(estimateBand('READING', 'ACADEMIC', 41)).toBeNull();
    expect(estimateBand('READING', 'ACADEMIC', 12.5)).toBeNull();
  });

  it('rounds the overall band the IELTS way', () => {
    expect(overallBand([6.5, 6, 6, 5.5])).toBe(6); // mean 6.0
    expect(overallBand([6.5, 6.5, 6, 6])).toBe(6.5); // mean 6.25 rounds up to 6.5
    expect(overallBand([7, 7, 6.5, 6.5])).toBe(7); // mean 6.75 rounds up to 7
    expect(overallBand([6, 6, 6, 6.5])).toBe(6); // mean 6.125 rounds down to 6
  });
});
