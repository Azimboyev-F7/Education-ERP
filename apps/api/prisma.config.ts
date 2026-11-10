import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Not needed for `prisma generate`; required for migrate.
    url: process.env.DATABASE_URL ?? 'postgresql://erp:erp@localhost:5432/erp',
    // Only needed for `migrate dev` on servers that cannot create databases (e.g. `prisma dev`).
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
});
