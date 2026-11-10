import { execSync } from 'node:child_process';

/** Applies the committed migrations to the test database once per run. */
export default function setup(): void {
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
