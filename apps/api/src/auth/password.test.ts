import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, hashPassword, passwordProblem, verifyPassword } from './password.js';

describe('temporary passwords', () => {
  it('are long, avoid look-alike characters, and differ every time', () => {
    const passwords = Array.from({ length: 50 }, () => generateTemporaryPassword());
    expect(new Set(passwords).size).toBe(50);
    for (const p of passwords) {
      expect(p).toHaveLength(14);
      expect(p).toMatch(/^[a-hj-km-np-zA-HJ-NP-Z2-9]+$/);
    }
  });
});

describe('passwordProblem', () => {
  it('rejects passwords containing the username, in any case', () => {
    expect(passwordProblem('xxJamshid2026xx', 'jamshid')).not.toBeNull();
  });
  it('rejects repetitive passwords', () => {
    expect(passwordProblem('aaaaaaaaaaaa', 'someone')).not.toBeNull();
  });
  it('accepts an ordinary passphrase', () => {
    expect(passwordProblem('correct horse battery', 'someone')).toBeNull();
  });
});

describe('hashing', () => {
  it('verifies the right password and nothing else', async () => {
    const hash = await hashPassword('right-password-1');
    expect(await verifyPassword(hash, 'right-password-1')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password-1')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'right-password-1')).toBe(false);
  });
});
