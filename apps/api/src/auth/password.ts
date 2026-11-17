import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Argon2id (the library default algorithm) with OWASP-recommended minimums.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// No 0/O, 1/l/I: temporary passwords get read out and typed by hand.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random one-time password (about 80 bits). Shown once to staff, never stored or logged. */
export function generateTemporaryPassword(length = 14): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

/** Why a chosen password is unacceptable, or null when it is fine. Length is checked by the schema. */
export function passwordProblem(password: string, username: string): string | null {
  if (password.toLowerCase().includes(username.toLowerCase())) return 'The password must not contain your username';
  if (new Set(password).size < 4) return 'The password is too repetitive';
  return null;
}
