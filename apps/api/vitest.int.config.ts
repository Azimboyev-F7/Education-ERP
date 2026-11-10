import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('.env.test')) process.loadEnvFile('.env.test');
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Point it at a throwaway database: integration tests truncate every table.');
}

/** Integration tests: the real application against a real PostgreSQL database. */
export default defineConfig({
  // NestJS dependency injection needs legacy decorators with emitted type metadata.
  oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
  test: {
    include: ['test/**/*.int.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
      // Tests drain the outbox explicitly so event handling is deterministic.
      OUTBOX_POLL_MS: '0',
    },
  },
});
