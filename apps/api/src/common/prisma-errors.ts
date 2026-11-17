import { Prisma } from '../generated/prisma/client.js';

/** A unique index rejected the write, typically because the name or username is already taken. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Runs a write and turns a unique-index violation into the given message for the caller (HTTP 409). */
export async function orConflict<T>(write: () => Promise<T>, conflict: (message: string) => Error, message: string): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict(message);
    throw error;
  }
}
