import { describe, expect, it } from 'vitest';
import { matchesAnswer, normalizeAnswer } from './normalize.js';

describe('normalizeAnswer', () => {
  it('ignores case, extra whitespace and trailing punctuation', () => {
    expect(normalizeAnswer('  Car   Park. ')).toBe('car park');
  });
  it('keeps internal punctuation', () => {
    expect(normalizeAnswer("Children’s ward")).toBe("children's ward");
  });
});

describe('matchesAnswer', () => {
  it('accepts any listed variant', () => {
    expect(matchesAnswer('9 AM', ['9 am', 'nine am'])).toBe(true);
  });
  it('rejects misspellings and blanks', () => {
    expect(matchesAnswer('libary', ['library'])).toBe(false);
    expect(matchesAnswer('   ', ['library'])).toBe(false);
  });
});
