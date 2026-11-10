/**
 * Normalises a typed answer for comparison against an answer key:
 * case, surrounding/duplicate whitespace, and trailing punctuation are ignored.
 * Deliberately conservative — spelling must still match, as in the real test.
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .trim();
}

/** True when the response matches any accepted variant of the key. */
export function matchesAnswer(response: string, accepted: readonly string[]): boolean {
  const given = normalizeAnswer(response);
  if (given === '') return false;
  return accepted.some((variant) => normalizeAnswer(variant) === given);
}
