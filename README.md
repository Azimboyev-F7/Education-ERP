# Education ERP — IELTS performance and self-training platform

Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). This repository currently contains **phase 0**:
identity, organisation model, role-scoped access, sessions, audit log, and the two front-end shells.

| Path | What |
|---|---|
| `apps/api` | NestJS API, Prisma schema and migrations, seed |
| `apps/admin` | Staff Console (Next.js), port 3000 |
| `apps/student` | Student App (Next.js), port 3001 |
| `packages/contracts` | zod schemas shared by API and front-ends |
| `packages/scoring` | pure scoring functions |

## Run locally

Requires Node 22+ and pnpm. PostgreSQL comes from Docker (`pnpm db:up`) or, without Docker,
from Prisma's local dev database (`pnpm --filter @erp/api exec prisma dev`, then use the TCP URL it prints).

1. `pnpm install`
2. Copy `.env.example` to `apps/api/.env`; set `DATABASE_URL` and choose a `SEED_PASSWORD`.
3. `pnpm db:migrate`
4. `pnpm build`, then `pnpm db:seed`
5. `pnpm dev`

Seeded accounts (all use `SEED_PASSWORD`): `admin`, `manager.main`, `teacher.a`, `teacher.b`, `student1`…`student9`.

## Checks

`pnpm typecheck` · `pnpm test` · `pnpm lint` · `pnpm build`

## Access rules

All visibility rules live in `apps/api/src/access/access.policy.ts`: administrators see the centre,
academic managers their branch, teachers the groups they teach, students only themselves.
"# Education-ERP" 
