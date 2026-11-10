import { defineConfig } from 'vitest/config';

/** Unit tests: pure logic, no database. */
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
