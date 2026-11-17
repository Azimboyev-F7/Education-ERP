# Education ERP — IELTS performance and self-training platform

Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The backend for **phases 0 and 1** is implemented: identity and role-scoped access, the content
library, assignments, the attempt engine, auto-scoring, the review queue, and the evidence and
reporting endpoints. The two front-ends are still sign-in shells.

| Path | What |
|---|---|
| `apps/api` | NestJS API, Prisma schema and migrations, seed |
| `apps/admin` | Staff Console (Next.js), port 3000 |
| `apps/student` | Student App (Next.js), port 3001 |
| `packages/contracts` | request and response schemas, the endpoint registry, and the generated OpenAPI document |
| `packages/scoring` | pure scoring functions |

## Run locally

Requires Node 22+ and pnpm. PostgreSQL comes from Docker (`pnpm db:up`) or, without Docker,
from Prisma's local dev database (`pnpm --filter @erp/api exec prisma dev`, then use the TCP URL it prints).

1. `pnpm install`
2. Copy `.env.example` to `apps/api/.env`; set `DATABASE_URL` and choose a `SEED_PASSWORD`.
3. `pnpm db:migrate`
4. `pnpm build`, then `pnpm db:seed`
5. `pnpm dev`

Accounts are created through the API (`POST /staff`, `POST /students`); each returns a one-time password that the
person must replace at first sign-in. Seeded accounts (all use `SEED_PASSWORD`): `admin`, `manager.main`, `teacher.a`, `teacher.b`, `student1`…`student9`.

## Checks

`pnpm typecheck` · `pnpm test` · `pnpm lint` · `pnpm build`

`pnpm test:int` runs the API against a real database and **truncates every table**, so it needs its
own throwaway database: put `TEST_DATABASE_URL=...` in `apps/api/.env.test`.
`apps/api/test/teacher-loop.int.test.ts` is the best walkthrough of the API: it runs the whole loop
from authoring a task set to the reports.

## API reference

With the API running (`pnpm dev`), open **http://localhost:4000/docs/** (or `/api/docs/` through either front-end) for the interactive
reference; the raw document is at `/openapi.json` and a committed copy is [docs/openapi.json](docs/openapi.json). It is generated from
`packages/contracts/src/endpoints.ts`: when you add or change a route, update the registry, then run
`pnpm --filter @erp/contracts run openapi` to refresh the committed copy. Tests fail until the registry, the controllers and the
committed copy agree.

## Access rules

All visibility rules live in `apps/api/src/access/access.policy.ts`: administrators see the centre,
academic managers their branch, teachers the groups they teach, students only themselves.
"# Education-ERP" 
