# IELTS Performance & Self-Training Platform — Architecture Plan

Source: *IELTS Student Performance Platform — Mission Report v1* (9 Nov 2026), plus one addition
from the product owner: students must be able to **train themselves**, not only complete assigned work.

## 1. The core idea

The brief describes a teacher-led loop (prepare → assign → complete → review → follow up).
Self-training is a second loop (choose → practise → review mistakes → get the next recommendation).

Both loops produce the same thing: **evidence of what a student can do, per IELTS skill and task type**.
So the system is built as **one attempt engine and one evidence store with two entry points**:

```
 Teacher loop                                             Student loop
 (Staff Console)                                          (Student App)
      │ assigns                                                │ self-starts
      ▼                                                        ▼
 ┌────────────┐    ┌──────────────────────────────┐    ┌──────────────┐
 │ Assignment │───▶│  ATTEMPT ENGINE              │◀───│ Practice /   │
 └────────────┘    │  player · timer · autosave   │    │ Mock / Review│
                   └──────────────┬───────────────┘    └──────────────┘
                                  ▼
                   ┌──────────────────────────────┐
                   │ SCORING                      │
                   │ auto (Listening/Reading)     │
                   │ teacher rubric (Writing/     │
                   │ Speaking) via review queue   │
                   └──────────────┬───────────────┘
                                  ▼
                   ┌──────────────────────────────┐
                   │ EVIDENCE STORE (append-only) │
                   │ student × skill × task type  │
                   │ × source × timed × date      │
                   └───────┬──────────────┬───────┘
                           ▼              ▼
              Staff analytics & alerts   Student progress, mistake bank,
              (center/class/student/     weakest task types, daily plan,
              assignment views)          roadmap to target band
```

Consequence: a homework set, a classwork quiz, a level check, a mock exam and a self-chosen
practice drill are all the same object (an **Attempt** on a **Task Set version**) with a different
*source* and *mode*. Nothing is built twice, and a teacher sees self-practice next to assigned work.

## 2. System shape

**Modular monolith.** One API, one PostgreSQL database, one job worker, two web front-ends.
Microservices would add operational cost with no benefit at learning-center scale; strict module
boundaries keep the option open to split later (the review queue and analytics are the natural seams).

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript end to end | One language, shared types between API and both apps |
| Repo | pnpm + Turborepo monorepo | Shared contracts, scoring and UI packages |
| API | NestJS (REST + OpenAPI) | Module system maps 1:1 to the domains below |
| Database | PostgreSQL 16 | Relational core, JSONB for question payloads, materialized rollups |
| ORM / migrations | Prisma | Typed queries, reviewed migrations |
| Jobs / events | Redis + BullMQ, transactional outbox | Scoring, evidence projection, alerts, notifications |
| Files | S3-compatible storage, presigned URLs | Listening audio, images, later speaking recordings |
| Staff Console | Next.js, `admin.<domain>` | Dense tables, filters, exports |
| Student App | Next.js PWA, `app.<domain>` | Mobile-first; installable; native app can reuse the API later |
| Auth | Sessions in httpOnly cookies, staff-created accounts | No public sign-up; centre owns the roster |
| Hosting | Docker Compose on one VM to start; managed Postgres with PITR backups | Simple to run, easy to grow |

```
apps/
  api/        NestJS — modules below
  worker/     BullMQ processors (same codebase as api, different entrypoint)
  admin/      Staff Console
  student/    Student App (PWA)
packages/
  contracts/  zod schemas + generated API client (single source of truth for DTOs)
  scoring/    pure functions: answer matching, raw→band tables, mastery maths
  ui/         shared components, charts, design tokens
  config/     eslint, tsconfig, env schema
```

## 3. Domain modules

Each module owns its tables; other modules call its service interface or react to its events.
No cross-module table access.

### 3.1 Identity & Organization
`Center → Branch → Course → Level → Group`, plus `AcademicPeriod`, `User`, `StaffProfile`,
`StudentProfile` (target band, exam date, Academic/General), `Enrollment` (student↔group, dated,
so history survives group changes), `GroupTeacher`.

- Every row carries `center_id` from day one (cheap now, painful to retrofit) even with one centre.
- Authorization is **role × scope**, evaluated in one policy layer, never ad hoc in controllers:
  - Teacher → own groups' students. Academic manager → branch. Administrator → centre.
  - Student → self only.
- Audit log for every staff write (who changed a score, a roster, a published set).

### 3.2 Content Library
Models real IELTS structure rather than flat questions:

```
TaskSet ─ TaskSetVersion (immutable once published)
            └ Section        (Listening Part 1–4 · Reading Passage 1–3 · Writing Task 1/2 · Speaking Part 1/2/3)
                └ Stimulus       (passage text · audio file · chart image · cue card)
                    └ QuestionGroup  (shared instructions + question type)
                        └ Question   (answer key, accepted variants, word limit, explanation)
```

- **Question types as a registry**: MCQ, multi-select, True/False/Not Given, Yes/No/Not Given,
  matching headings/information/features, sentence/summary/note/table/form completion,
  diagram/map labelling, short answer, essay prompt, speaking prompt. Each type = payload schema +
  renderer + scorer. Adding SAT later means adding types, not changing the engine.
- **Tags**: skill, task type, difficulty, topic, lesson, learning objective.
- **Lifecycle**: draft → in review → published → retired, with create/approve permissions
  (addresses the brief's content-rights risk).
- **Versioning**: editing a published set creates a new version. Attempts point at the version they
  were taken on, so old results never change meaning.

### 3.3 Assignments
`Assignment` (task set version, kind: classwork | homework | level check | exam, audience, opens/due,
time limit, attempts allowed, instructions) and `AssignmentRecipient` — one row per student holding
status: `assigned → started → submitted → awaiting review → reviewed`, plus `overdue`, `excused`.
Group assignments are expanded to recipients at creation, so late joiners and exemptions are explicit.

### 3.4 Attempt Engine
`Attempt` (student, task set version, **source**: assignment | self-practice | mock | review-redo,
**mode**: timed | untimed, started/submitted) and `Response` (raw answer, correctness, score,
time spent, change count).

- Server-authoritative timer; autosave every few seconds; resume after disconnect; idempotent submit.
- Answer keys and explanations never reach the browser before submission.
- Writing: `WritingSubmission` with draft history and word count. Speaking: prompt + completion
  record now; audio capture behind a feature flag (the brief makes it conditional on centre approval).

### 3.5 Scoring & Review
- **Auto-scoring** (Listening, Reading): normalisation (case, spacing, articles, number forms),
  accepted variants, word-limit enforcement. Pure functions in `packages/scoring`, exhaustively unit-tested.
- **Band estimate**: raw→band conversion tables (Academic vs General Reading differ), always labelled
  *estimate* and only shown for full-length timed sets.
- **Teacher review** (Writing, Speaking): `ReviewTask` queue with assignee and age; versioned `Rubric`
  with the four IELTS criteria per skill (Writing: Task Achievement/Response, Coherence & Cohesion,
  Lexical Resource, Grammatical Range & Accuracy; Speaking: Fluency & Coherence, Lexical Resource,
  Grammatical Range & Accuracy, Pronunciation); per-criterion band, inline comments, next-step goal,
  request-revision flow.
- **Moderation**: optional second marker on a sample, with disagreement report (rubric consistency risk).
- Scorers sit behind an `Evaluator` interface. Teacher review is the first implementation; an AI
  evaluator can be added later as a separate, separately-labelled source without touching the model.

### 3.6 Evidence & Analytics
One append-only fact table written by a projector when an attempt is scored or reviewed:

```
skill_evidence(student, group_at_time, teacher_at_time, branch, skill, task_type, question_type,
               topic, score, max_score, band_estimate?, timed, source, evidence_kind, occurred_at,
               attempt_id, task_set_version_id)
evidence_kind: official_result | teacher_assessed | auto_scored | ai_estimate
```

- `evidence_kind` is what keeps official results, teacher judgments and practice estimates distinct
  everywhere (the brief's score-interpretation risk).
- Rollup tables refreshed incrementally: student / group / teacher / branch × skill × task type × week.
- **Mastery** per student × task type: recency-weighted accuracy with an evidence count; nothing is
  shown as a trend below a minimum count ("change over time based on multiple assessments").
- Every aggregate in the UI links to the attempts behind it (summary → evidence drill-down).
- **Alert rules**: repeated low completion, missed deadlines, persistent skill gap, review waiting too
  long → `Flag` on a student or queue, surfaced on teacher and manager dashboards.
- Postgres only. A separate warehouse is not needed until there is real volume.

### 3.7 Self-Training
All of it reads the evidence store and launches attempts; it owns very little data itself.

| Feature | How it works |
|---|---|
| Practice hall | Browse published sets by skill / task type / difficulty; untimed or timed |
| Mistake bank | Every wrong response is queued for redo; cleared after correct repeats |
| Weakest task types | Lowest mastery with enough evidence, each with a one-tap drill |
| Full mock tests | Four-skill timed sets; L/R scored instantly, W/S enter the teacher queue (quota-limited) |
| Vocabulary | Personal + teacher word lists, spaced repetition scheduling |
| Target & roadmap | Target band and exam date → weekly plan by skill, progress against it |
| Daily plan | Rule-based: overdue assignment → due vocabulary → weakest task type → mistake redo |

Recommendations are deliberately rule-based and explainable first; adaptive logic comes after there
is data to validate it against.

### 3.8 Platform services
Notifications (in-app first; email/Telegram adapters through the outbox), file service, CSV/XLSX
exports as background jobs, i18n scaffolding in both apps, structured logs + error tracking + health checks.

## 4. Key flows

**Assigned homework**: teacher picks group → selects/creates set → assigns → recipients created and
notified → student attempts → objective parts auto-scored, productive parts create review tasks →
teacher scores with rubric → evidence projected → dashboards and student feedback update → teacher
assigns follow-up from the result screen.

**Self-training**: student opens daily plan → starts drill → instant score + explanations → wrong
answers enter mistake bank → mastery updates → next recommendation changes → the teacher sees the
same activity on the student page, marked as self-practice.

## 5. Delivery phases

| Phase | Scope | Exit test |
|---|---|---|
| 0 Foundations | Monorepo, CI, auth, org model, roles & scopes, audit log, seed data | Staff can log in and see only what their role allows |
| 1 Teacher loop (brief's must-haves) | Roster; content library with L/R question types and W/S prompts; assignments; attempt player; auto-scoring; rubric review queue; student/class/assignment views; filters; exports | One pilot course runs homework end to end |
| 2 Self-training | Practice hall, mistake bank, weakest task types, vocabulary, target band, daily plan, full mocks | Students practise unassigned and teachers see it |
| 3 Insight | Alerts, trend views, branch/teacher comparison, assignment templates, revision workflow, moderation | Managers find at-risk learners without opening class records |
| 4 Validate first | Speaking audio, AI feedback, parent access, gamification, SAT module | Each gated on a demonstrated need |

Self-training is moved ahead of the brief's ordering because it is a stated goal and, on this
architecture, mostly a new front door onto the phase 1 engine.

## 6. Decisions needed from the product owner

1. **Stack** — TypeScript/NestJS/Next.js/PostgreSQL as above, or an existing team preference.
2. **One centre or a product sold to many** — the schema supports both; it changes onboarding and billing only.
3. **Writing/Speaking in self-training** — teacher queue with a quota (default), or AI feedback
   labelled as an estimate. The brief lists AI evaluation as "later, validate first".
4. **Content source** — original material written by the centre, or licensed. Published IELTS
   practice tests are copyrighted and cannot simply be loaded in.
5. **Login** — username/password issued by staff (default), or phone/Telegram.
6. **Languages** at launch, and whether multiple branches exist on day one.

## 7. Implementation status and deliberate deviations

Phases 0 and 1 are implemented on the backend (`apps/api`); the front-ends are still thin shells.

| Area | Where | Notes |
|---|---|---|
| Access rules | `src/access/` | Pure policy functions plus one service that applies them to rows |
| Accounts and enrolment | `src/accounts/`, `src/org/` | Staff and student accounts, one-time passwords, roles, disable/enable, enrol / remove / transfer; centre structure and group management |
| Content library | `src/content/` | A draft is saved as one validated document; published versions are immutable |
| Question types | `packages/scoring/src/question-types.ts` | Registry: schema + scorer per type; eight types so far |
| Assignments | `src/assignments/` | One recipient row per student; "overdue" is derived from the due date, not stored |
| Attempt engine | `src/attempts/` | Server-side deadline, autosave, idempotent submit, keys withheld until submission |
| Review | `src/reviews/` | Queue scoped to the reviewer's students; rubric bands validated; IELTS rounding |
| Evidence | `src/analytics/` | Outbox-driven projector into `SkillEvidence`; student, group and assignment reports |
| Events | `src/outbox/` | Transactional outbox with at-least-once delivery, backoff and a dead-letter state |

Where the build differs from the plan above, and why:

- **Queue: PostgreSQL outbox instead of Redis + BullMQ.** Events are written in the same transaction
  as the change, which a Redis queue cannot guarantee, and it removes a moving part. The
  `publish / on / drain` interface is the seam if a dedicated queue is needed later.
- **Rollups: computed on read instead of pre-aggregated tables.** The fact table is indexed for the
  three report shapes. Add rollup tables when a report gets slow, not before.
- **Rubrics: defined in code, versioned by key** (`IELTS_WRITING_V1`) instead of a database table.
  A review stores the key it was scored with. Move them to data if centres need to edit rubrics.
- **Tags: a string array on the version** (`topic:energy`) instead of a tag table.
- **One published version per task set.** Publishing a new version retires the previous one;
  work already assigned on the old version continues against it.
- **Band estimates** are produced only for full-length (40-question), timed Listening or Reading
  sets, from approximate public conversion tables, and are always flagged as estimates.

Account management rules: only administrators create staff, change roles, or change the centre structure;
academic managers create students and manage groups and enrolments inside their own branches; teachers
can set a student's goals but not change accounts. New and reset accounts get a random one-time password
(shown once, never stored or logged) and can do nothing but change it until they do. Disabling or resetting
an account ends its sessions at once, and the centre can never be left without an active administrator
(changes that could do so are serialised on the centre row). One open enrolment per student and group is
enforced by a partial unique index.

Not built yet from phase 1: CSV/XLSX exports, file upload for audio and images (only a storage key
is stored), second-marker moderation, revision requests, and the staff and student screens.
