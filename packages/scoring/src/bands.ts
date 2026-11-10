/**
 * Raw-score to band conversion for full 40-question Listening and Reading tests.
 *
 * These are the commonly published approximate conversions. The real thresholds vary
 * slightly between test versions, so every value produced here is an ESTIMATE and must be
 * labelled as one wherever it is shown. Each row is [minimum correct answers, band].
 */
type Table = readonly (readonly [min: number, band: number])[];

const LISTENING: Table = [
  [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5],
  [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5],
];

const READING_ACADEMIC: Table = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5],
  [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5],
];

const READING_GENERAL: Table = [
  [40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6], [27, 5.5],
  [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5],
];

export const FULL_TEST_QUESTIONS = 40;

/** Returns an estimated band, or null when no estimate is meaningful for this input. */
export function estimateBand(
  skill: 'LISTENING' | 'READING',
  module: 'ACADEMIC' | 'GENERAL',
  correct: number,
): number | null {
  if (!Number.isInteger(correct) || correct < 0 || correct > FULL_TEST_QUESTIONS) return null;
  const table = skill === 'LISTENING' ? LISTENING : module === 'GENERAL' ? READING_GENERAL : READING_ACADEMIC;
  for (const [min, band] of table) if (correct >= min) return band;
  return correct >= 2 ? 2 : correct === 1 ? 1 : 0;
}

/**
 * Overall band from rubric criterion bands: the mean, rounded to the nearest half band,
 * with .25 rounding up to .5 and .75 rounding up to the next whole band (the IELTS convention).
 */
export function overallBand(criteria: readonly number[]): number {
  if (criteria.length === 0) throw new Error('At least one criterion band is required');
  const mean = criteria.reduce((sum, band) => sum + band, 0) / criteria.length;
  return Math.floor(mean * 2 + 0.5) / 2;
}
