import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINTS } from '@erp/contracts';
import { HITS_DIR } from './contract.js';

/** Applies the committed migrations to the test database once per run. */
export default function setup(): () => void {
  rmSync(HITS_DIR, { recursive: true, force: true });
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });

  return function teardown(): void {
    const hit = new Set(
      existsSync(HITS_DIR)
        ? readdirSync(HITS_DIR).flatMap((file) => readFileSync(join(HITS_DIR, file), 'utf8').split('\n'))
        : [],
    );
    rmSync(HITS_DIR, { recursive: true, force: true });

    // A response schema nobody has exercised is a promise nobody has checked.
    const untested = ENDPOINTS.filter((e) => !hit.has(e.id)).map((e) => `${e.method.toUpperCase()} ${e.path}`);
    if (untested.length === 0) return;
    const message = `${untested.length} endpoint(s) were never answered successfully during this run:\n  ${untested.join('\n  ')}`;
    // Running a single test file can't cover everything, so this only fails a full run in CI.
    if (process.env.CONTRACT_COVERAGE === 'strict') throw new Error(message);
    console.warn(`\n${message}\n`);
  };
}
