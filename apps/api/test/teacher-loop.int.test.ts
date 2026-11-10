import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, resetDb, seedOrg, startApp, type TestApp } from './harness.js';

/**
 * The whole teacher loop, in order, through the HTTP API:
 * author → approve → assign → attempt → auto-score → review → evidence → reports.
 * Steps share state on purpose; each one is a stage of the same story.
 */
const CONTENT = {
  difficulty: 3,
  tags: ['topic:energy'],
  sections: [
    {
      skill: 'READING',
      kind: 'READING_PASSAGE_1',
      stimuli: [{ kind: 'PASSAGE', title: 'Energy', text: 'A passage about energy from the sun.' }],
      groups: [
        {
          type: 'MULTIPLE_CHOICE',
          stimulusIndex: 0,
          questions: [
            {
              number: 1,
              prompt: { stem: 'The passage is about', options: [{ id: 'A', text: 'wind' }, { id: 'B', text: 'sun' }] },
              answerKey: { correct: ['B'] },
              explanation: 'See paragraph one.',
            },
          ],
        },
        {
          type: 'TRUE_FALSE_NOT_GIVEN',
          stimulusIndex: 0,
          questions: [
            { number: 2, prompt: { statement: 'Solar is free.' }, answerKey: { value: 'NOT_GIVEN' } },
            { number: 3, prompt: { statement: 'Solar is growing.' }, answerKey: { value: 'TRUE' } },
          ],
        },
        {
          type: 'SENTENCE_COMPLETION',
          config: { maxWords: 2 },
          questions: [{ number: 4, prompt: { text: 'The main topic is ___.' }, answerKey: { accepted: ['solar power'] } }],
        },
      ],
    },
    {
      skill: 'WRITING',
      kind: 'WRITING_TASK_2',
      groups: [{ type: 'ESSAY', questions: [{ number: 5, prompt: { text: 'Discuss renewable energy.' } }] }],
    },
  ],
};

/** A loosely typed copy of the content, for building deliberately invalid variants. */
const variant = (): any => structuredClone(CONTENT);

describe('teacher loop', () => {
  let t: TestApp;
  let org: Awaited<ReturnType<typeof seedOrg>>;
  let admin: Client, manager: Client, teacherA: Client, teacherB: Client, s1: Client, s2: Client, s3: Client;

  let taskSetId: string;
  let versionId: string;
  let assignmentId: string;
  let attemptId: string;
  let reviewId: string;
  const questionId: Record<number, string> = {};

  beforeAll(async () => {
    t = await startApp();
    await resetDb(t.prisma);
    org = await seedOrg(t.prisma);
    admin = await t.as('admin');
    manager = await t.as('manager');
    teacherA = await t.as('teacher.a');
    teacherB = await t.as('teacher.b');
    s1 = await t.as('s1');
    s2 = await t.as('s2');
    s3 = await t.as('s3');
  });

  afterAll(async () => {
    await t.close();
  });

  // ───────────── content library ─────────────

  it('lets a teacher draft content but keeps students out of the library', async () => {
    const created = await teacherA.post('/task-sets', { title: 'Energy reading + essay' });
    expect(created.status).toBe(201);
    ({ id: taskSetId, versionId } = created.body);

    expect((await s1.get('/task-sets')).status).toBe(403);
    expect((await s1.get(`/task-set-versions/${versionId}`)).status).toBe(403);
  });

  it('rejects content the question-type registry does not accept', async () => {
    const broken = variant();
    broken.sections[0].groups[0].questions[0].answerKey = { correct: ['Z'] };
    const reply = await teacherA.put(`/task-set-versions/${versionId}/content`, broken);
    expect(reply.status).toBe(400);
    expect(reply.body.issues[0].path).toBe('sections.0.groups.0.questions.0');

    const duplicate = variant();
    duplicate.sections[1].groups[0].questions[0].number = 1;
    expect((await teacherA.put(`/task-set-versions/${versionId}/content`, duplicate)).status).toBe(400);

    const wrongKind = variant();
    wrongKind.sections[0].kind = 'WRITING_TASK_1';
    expect((await teacherA.put(`/task-set-versions/${versionId}/content`, wrongKind)).status).toBe(400);
  });

  it('saves a draft atomically and only lets its author or an approver edit it', async () => {
    expect((await teacherB.put(`/task-set-versions/${versionId}/content`, CONTENT)).status).toBe(403);

    const saved = await teacherA.put(`/task-set-versions/${versionId}/content`, CONTENT);
    expect(saved.status).toBe(200);
    const questions = saved.body.sections.flatMap((s: any) => s.groups.flatMap((g: any) => g.questions));
    expect(questions).toHaveLength(5);
    for (const q of questions) questionId[q.number] = q.id;
    // The group is linked to the stimulus it refers to.
    expect(saved.body.sections[0].groups[0].stimulusId).toBe(saved.body.sections[0].stimuli[0].id);
  });

  it('requires approval: teachers cannot publish, managers can, and nothing is assignable before', async () => {
    const early = await teacherA.post('/assignments', { versionId, kind: 'HOMEWORK', title: 'Too early', groupId: org.groupA.id });
    expect(early.status).toBe(409);

    expect((await manager.post(`/task-set-versions/${versionId}/publish`)).status).toBe(409); // still a draft
    expect((await teacherA.post(`/task-set-versions/${versionId}/submit`)).status).toBe(204);
    expect((await teacherA.post(`/task-set-versions/${versionId}/publish`)).status).toBe(403);
    expect((await manager.post(`/task-set-versions/${versionId}/publish`)).status).toBe(204);
  });

  it('makes published content immutable', async () => {
    expect((await teacherA.put(`/task-set-versions/${versionId}/content`, CONTENT)).status).toBe(409);
    expect((await admin.put(`/task-set-versions/${versionId}/content`, CONTENT)).status).toBe(409);
  });

  // ───────────── assignments ─────────────

  it('assigns to a group the teacher teaches and creates one recipient per enrolled student', async () => {
    const outside = await teacherA.post('/assignments', { versionId, kind: 'HOMEWORK', title: 'Not mine', groupId: org.groupB.id });
    expect(outside.status).toBe(404);
    const stranger = await teacherA.post('/assignments', { versionId, kind: 'HOMEWORK', title: 'Not mine', studentIds: [org.s3.id] });
    expect(stranger.status).toBe(404);

    const created = await teacherA.post('/assignments', {
      versionId,
      kind: 'HOMEWORK',
      title: 'Energy homework',
      groupId: org.groupA.id,
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(created.status).toBe(201);
    expect(created.body.recipients).toBe(2);
    assignmentId = created.body.id;

    const detail = await teacherA.get(`/assignments/${assignmentId}`);
    expect(detail.body.counts).toMatchObject({ total: 2, assigned: 2, overdue: 0 });
  });

  it('scopes assignments by role', async () => {
    expect((await teacherB.get(`/assignments/${assignmentId}`)).status).toBe(404);
    expect((await teacherB.get('/assignments')).body).toHaveLength(0);
    expect((await manager.get('/assignments')).body).toHaveLength(1); // Main branch
    expect((await admin.get('/assignments')).body).toHaveLength(1);
    expect((await s1.get('/assignments')).status).toBe(403);
  });

  // ───────────── attempt engine ─────────────

  it('shows students their own work and starts an attempt without leaking answers', async () => {
    const mine = await s1.get('/my/assignments');
    expect(mine.body).toHaveLength(1);
    expect((await s3.get('/my/assignments')).body).toHaveLength(0);
    expect((await teacherA.get('/my/assignments')).status).toBe(403);

    const recipientId = mine.body[0].recipientId;
    const started = await s1.post('/attempts', { recipientId });
    expect(started.status).toBe(201);
    attemptId = started.body.id;

    // Starting again resumes the same attempt rather than creating another.
    expect((await s1.post('/attempts', { recipientId })).body).toEqual({ id: attemptId, resumed: true });
    // Another student cannot start someone else's assignment.
    expect((await s2.post('/attempts', { recipientId })).status).toBe(404);

    const view = await s1.get(`/attempts/${attemptId}`);
    expect(view.status).toBe(200);
    expect(view.body.status).toBe('IN_PROGRESS');
    expect(view.text).not.toContain('answerKey');
    expect(view.text).not.toContain('solar power');
    expect(view.text).not.toContain('See paragraph one.');
    expect(view.body.score).toBeUndefined();
  });

  it('hides an attempt from other students and from teachers of other groups', async () => {
    expect((await s2.get(`/attempts/${attemptId}`)).status).toBe(404);
    expect((await teacherB.get(`/attempts/${attemptId}`)).status).toBe(404);
    expect((await teacherA.get(`/attempts/${attemptId}`)).status).toBe(200);
  });

  it('autosaves valid answers and rejects malformed or foreign ones', async () => {
    const bad = await s1.put(`/attempts/${attemptId}/responses`, {
      responses: [{ questionId: questionId[2], answer: { value: 'MAYBE' } }],
    });
    expect(bad.status).toBe(400);
    expect((await s1.put(`/attempts/${attemptId}/responses`, { responses: [{ questionId: 'nope', answer: {} }] })).status).toBe(400);
    expect((await s2.put(`/attempts/${attemptId}/responses`, { responses: [{ questionId: questionId[1], answer: { selected: ['B'] } }] })).status).toBe(404);

    const saved = await s1.put(`/attempts/${attemptId}/responses`, {
      responses: [
        { questionId: questionId[1], answer: { selected: ['A'] }, timeSpentMs: 4000 },
        { questionId: questionId[2], answer: { value: 'FALSE' } },
        { questionId: questionId[4], answer: { text: '  Solar   Power. ' } },
        { questionId: questionId[5], answer: { text: 'Renewable energy matters because…' } },
      ],
    });
    expect(saved.body.saved).toBe(4);

    // Changing an answer overwrites it and counts the change. Question 3 is left blank.
    await s1.put(`/attempts/${attemptId}/responses`, { responses: [{ questionId: questionId[1], answer: { selected: ['B'] } }] });
    const stored = await t.prisma.response.findFirstOrThrow({ where: { attemptId, questionId: questionId[1] } });
    expect(stored).toMatchObject({ answer: { selected: ['B'] }, changeCount: 1, timeSpentMs: 4000, isCorrect: null });
  });

  it('scores objective answers on submit, queues the essay for review, and is idempotent', async () => {
    const submitted = await s1.post(`/attempts/${attemptId}/submit`);
    expect(submitted.status).toBe(200);
    expect(submitted.body).toMatchObject({ status: 'AWAITING_REVIEW', score: 2, maxScore: 4, bandEstimate: null });

    // Answers and explanations are revealed only now.
    expect(submitted.text).toContain('answerKey');
    expect(submitted.text).toContain('See paragraph one.');
    const byQuestion = Object.fromEntries(submitted.body.responses.map((r: any) => [r.questionId, r]));
    expect(byQuestion[questionId[1]!].isCorrect).toBe(true);
    expect(byQuestion[questionId[2]!].isCorrect).toBe(false);
    expect(byQuestion[questionId[4]!].isCorrect).toBe(true);
    expect(byQuestion[questionId[5]!].review).toEqual({ status: 'PENDING' });

    const again = await s1.post(`/attempts/${attemptId}/submit`);
    expect(again.body).toMatchObject({ status: 'AWAITING_REVIEW', score: 2, maxScore: 4 });
    expect(await t.prisma.reviewTask.count()).toBe(1);
    expect(await t.prisma.outboxEvent.count({ where: { type: 'attempt.submitted' } })).toBe(1);

    expect((await s1.put(`/attempts/${attemptId}/responses`, { responses: [{ questionId: questionId[2], answer: { value: 'TRUE' } }] })).status).toBe(409);
    expect((await s1.post('/attempts', { recipientId: (await s1.get('/my/assignments')).body[0].recipientId })).status).toBe(409); // no attempts left
  });

  it('updates the assignment status as work comes in', async () => {
    const detail = await teacherA.get(`/assignments/${assignmentId}`);
    expect(detail.body.counts).toMatchObject({ total: 2, assigned: 1, awaitingReview: 1, completed: 0 });
  });

  // ───────────── evidence ─────────────

  it('projects auto-scored evidence from the outbox, exactly once', async () => {
    expect(await t.prisma.skillEvidence.count()).toBe(0); // nothing until the worker runs
    expect(await t.outbox.drain()).toBe(1);

    const rows = await t.prisma.skillEvidence.findMany({ orderBy: { taskType: 'asc' } });
    expect(rows.map((r) => [r.skill, r.taskType, r.kind, r.score, r.maxScore])).toEqual([
      ['READING', 'MULTIPLE_CHOICE', 'AUTO_SCORED', 1, 1],
      ['READING', 'SENTENCE_COMPLETION', 'AUTO_SCORED', 1, 1],
      ['READING', 'TRUE_FALSE_NOT_GIVEN', 'AUTO_SCORED', 0, 2],
    ]);
    expect(rows.every((r) => r.groupId === org.groupA.id && r.source === 'ASSIGNMENT')).toBe(true);

    // Redelivering the same event must not duplicate evidence.
    await t.prisma.outboxEvent.updateMany({ data: { processedAt: null, availableAt: new Date(0) } });
    await t.outbox.drain();
    expect(await t.prisma.skillEvidence.count()).toBe(3);
  });

  // ───────────── review ─────────────

  it('shows the essay only in the queue of staff who may see the student', async () => {
    expect((await teacherB.get('/reviews')).body).toHaveLength(0);
    expect((await s1.get('/reviews')).status).toBe(403);

    const queue = await teacherA.get('/reviews');
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({ skill: 'WRITING', taskType: 'WRITING_TASK_2', status: 'PENDING' });
    reviewId = queue.body[0].id;

    expect((await teacherB.get(`/reviews/${reviewId}`)).status).toBe(404);
    const detail = await teacherA.get(`/reviews/${reviewId}`);
    expect(detail.body.answer.text).toContain('Renewable energy');
    expect(detail.body.rubric.criteria.map((c: any) => c.key)).toEqual(['TR', 'CC', 'LR', 'GRA']);
  });

  it('validates rubric scores and completes the attempt when the last review is done', async () => {
    expect((await teacherA.post(`/reviews/${reviewId}/score`, { criteria: { TR: 6, CC: 6, LR: 6 } })).status).toBe(400);
    expect((await teacherA.post(`/reviews/${reviewId}/score`, { criteria: { TR: 6, CC: 6, LR: 6, GRA: 6.3 } })).status).toBe(400);
    expect((await teacherB.post(`/reviews/${reviewId}/score`, { criteria: { TR: 6, CC: 6, LR: 6, GRA: 6 } })).status).toBe(404);

    const scored = await teacherA.post(`/reviews/${reviewId}/score`, {
      criteria: { TR: 6.5, CC: 6.5, LR: 6, GRA: 6 },
      comment: 'Clear position; develop your second paragraph.',
      nextStep: 'Practise topic sentences.',
    });
    expect(scored.status).toBe(201);
    expect(scored.body.overallBand).toBe(6.5); // mean 6.25 rounds up to 6.5

    expect((await teacherA.post(`/reviews/${reviewId}/score`, { criteria: { TR: 9, CC: 9, LR: 9, GRA: 9 } })).status).toBe(409);

    const view = await s1.get(`/attempts/${attemptId}`);
    expect(view.body.status).toBe('COMPLETED');
    const essay = view.body.responses.find((r: any) => r.questionId === questionId[5]);
    expect(essay.review).toMatchObject({ status: 'DONE', overallBand: 6.5, nextStep: 'Practise topic sentences.' });

    const detail = await teacherA.get(`/assignments/${assignmentId}`);
    expect(detail.body.counts).toMatchObject({ awaitingReview: 0, completed: 1 });
  });

  it('projects teacher-assessed evidence separately from auto-scored evidence', async () => {
    await t.outbox.drain();
    const assessed = await t.prisma.skillEvidence.findMany({ where: { kind: 'TEACHER_ASSESSED' } });
    expect(assessed).toHaveLength(1);
    expect(assessed[0]).toMatchObject({ skill: 'WRITING', taskType: 'WRITING_TASK_2', band: 6.5, maxScore: 9 });
    expect(await t.prisma.skillEvidence.count({ where: { kind: 'AUTO_SCORED' } })).toBe(3);
  });

  // ───────────── reports ─────────────

  it('reports question-level results for the assignment', async () => {
    const report = await teacherA.get(`/assignments/${assignmentId}/report`);
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({ submitted: 1, accuracy: 0.5 });
    expect(report.body.questions.map((q: any) => [q.number, q.correct, q.total])).toEqual([
      [1, 1, 1],
      [2, 0, 1],
      [3, 0, 1], // left blank counts as wrong
      [4, 1, 1],
    ]);
    expect(report.body.students.map((s: any) => [s.student.fullName, s.status, s.score])).toEqual([
      ['s1', 'COMPLETED', 2],
      ['s2', 'ASSIGNED', null],
    ]);
    expect((await teacherB.get(`/assignments/${assignmentId}/report`)).status).toBe(404);
  });

  it('summarises a student by skill and task type, keeping evidence kinds apart', async () => {
    const summary = await teacherA.get(`/analytics/students/${org.s1.id}`);
    expect(summary.status).toBe(200);
    expect(summary.body.completion).toMatchObject({ assigned: 1, completed: 1, overdue: 0 });
    const tfng = summary.body.skills.find((s: any) => s.taskType === 'TRUE_FALSE_NOT_GIVEN');
    expect(tfng).toMatchObject({ skill: 'READING', kind: 'AUTO_SCORED', measure: 'accuracy', all: { count: 1, value: 0 } });
    const writing = summary.body.skills.find((s: any) => s.skill === 'WRITING');
    expect(writing).toMatchObject({ kind: 'TEACHER_ASSESSED', measure: 'band', all: { count: 1, value: 6.5 } });

    expect((await teacherB.get(`/analytics/students/${org.s1.id}`)).status).toBe(404);
    expect((await s2.get(`/analytics/students/${org.s1.id}`)).status).toBe(403);
    expect((await s1.get('/my/progress')).body.skills).toHaveLength(4);
    expect((await s2.get('/my/progress')).body.skills).toHaveLength(0);
  });

  it('summarises a group with per-student completion', async () => {
    const summary = await teacherA.get(`/analytics/groups/${org.groupA.id}`);
    expect(summary.status).toBe(200);
    expect(summary.body.completion).toMatchObject({ assigned: 2, completed: 1, open: 1 });
    expect(summary.body.students.map((s: any) => [s.fullName, s.completion.completed, s.accuracy])).toEqual([
      ['s1', 1, 0.5],
      ['s2', 0, null],
    ]);
    expect((await teacherB.get(`/analytics/groups/${org.groupA.id}`)).status).toBe(404);
    expect((await manager.get(`/analytics/groups/${org.groupA.id}`)).status).toBe(200);
    expect((await manager.get(`/analytics/groups/${org.groupB.id}`)).status).toBe(404);
  });

  // ───────────── timer, overdue, self-practice, versioning ─────────────

  it('enforces the time limit on the server', async () => {
    const created = await teacherA.post('/assignments', {
      versionId,
      kind: 'CLASSWORK',
      title: 'Timed quiz',
      studentIds: [org.s2.id],
      timeLimitSec: 600,
    });
    const recipientId = (await s2.get('/my/assignments')).body.find((a: any) => a.assignmentId === created.body.id).recipientId;
    const { id } = (await s2.post('/attempts', { recipientId })).body;

    const view = await s2.get(`/attempts/${id}`);
    expect(view.body.timed).toBe(true);
    expect(new Date(view.body.deadlineAt).getTime() - new Date(view.body.startedAt).getTime()).toBeCloseTo(600_000, -3);
    await s2.put(`/attempts/${id}/responses`, { responses: [{ questionId: questionId[1], answer: { selected: ['B'] } }] });

    // Move the deadline into the past: late saves are refused and the next read closes the attempt.
    await t.prisma.attempt.update({ where: { id }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    const late = await s2.put(`/attempts/${id}/responses`, { responses: [{ questionId: questionId[2], answer: { value: 'NOT_GIVEN' } }] });
    expect(late.status).toBe(409);

    const closed = await s2.get(`/attempts/${id}`);
    expect(closed.body).toMatchObject({ status: 'COMPLETED', score: 1, maxScore: 4 });
  });

  it('derives overdue from the due date and lets a teacher excuse a student', async () => {
    await t.prisma.assignment.update({ where: { id: assignmentId }, data: { dueAt: new Date(Date.now() - 1000) } });
    const detail = await teacherA.get(`/assignments/${assignmentId}`);
    expect(detail.body.counts.overdue).toBe(1);
    expect(detail.body.recipients.find((r: any) => r.student.fullName === 's2').overdue).toBe(true);
    expect((await s2.get('/my/assignments')).body.find((a: any) => a.assignmentId === assignmentId).overdue).toBe(true);

    expect((await teacherA.post(`/assignments/${assignmentId}/recipients/${org.s2.id}/excuse`)).status).toBe(204);
    expect((await teacherA.get(`/assignments/${assignmentId}`)).body.counts).toMatchObject({ overdue: 0, excused: 1 });
    expect((await teacherA.post(`/assignments/${assignmentId}/recipients/${org.s1.id}/excuse`)).status).toBe(409); // already done
  });

  it('lets a student practise published content on their own, feeding the same evidence store', async () => {
    const catalog = await s3.get('/practice/task-sets');
    expect(catalog.body).toHaveLength(1);
    expect((await teacherA.get('/practice/task-sets')).status).toBe(403);

    const { id } = (await s3.post('/attempts', { versionId })).body;
    expect((await s3.post('/attempts', { versionId })).body).toEqual({ id, resumed: true });
    await s3.put(`/attempts/${id}/responses`, { responses: [{ questionId: questionId[3], answer: { value: 'TRUE' } }] });
    const done = await s3.post(`/attempts/${id}/submit`);
    expect(done.body).toMatchObject({ status: 'COMPLETED', source: 'SELF_PRACTICE', timed: false, score: 1, maxScore: 4 });

    await t.outbox.drain();
    const evidence = await t.prisma.skillEvidence.findMany({ where: { studentId: org.s3.id } });
    expect(evidence).toHaveLength(3);
    expect(evidence.every((e) => e.source === 'SELF_PRACTICE' && e.groupId === org.groupB.id)).toBe(true);
    // Teacher B sees their student's self-practice; teacher A does not.
    expect((await teacherB.get(`/analytics/students/${org.s3.id}`)).body.skills).toHaveLength(3);
    expect((await teacherA.get(`/analytics/students/${org.s3.id}`)).status).toBe(404);
  });

  it('versions content: a new version replaces the old one without touching past results', async () => {
    const created = await teacherA.post(`/task-sets/${taskSetId}/versions`);
    expect(created.status).toBe(201);
    const v2 = created.body.versionId;
    expect((await teacherA.post(`/task-sets/${taskSetId}/versions`)).status).toBe(409); // one open draft at a time

    const copy = await teacherA.get(`/task-set-versions/${v2}`);
    expect(copy.body).toMatchObject({ number: 2, status: 'DRAFT' });
    expect(copy.body.sections.flatMap((s: any) => s.groups.flatMap((g: any) => g.questions))).toHaveLength(5);

    await teacherA.post(`/task-set-versions/${v2}/submit`);
    expect((await manager.post(`/task-set-versions/${v2}/return`)).status).toBe(204);
    await teacherA.post(`/task-set-versions/${v2}/submit`);
    expect((await admin.post(`/task-set-versions/${v2}/publish`)).status).toBe(204);

    expect((await admin.get(`/task-set-versions/${versionId}`)).body.status).toBe('RETIRED');
    expect((await s3.get('/practice/task-sets')).body.map((v: any) => v.versionId)).toEqual([v2]);
    expect((await s3.post('/attempts', { versionId })).status).toBe(404); // retired versions cannot be started

    // The first student's result still points at, and renders from, version 1.
    const old = await s1.get(`/attempts/${attemptId}`);
    expect(old.body.content.versionId).toBe(versionId);
    expect(old.body.score).toBe(2);
  });

  it('writes an audit entry for every staff write', async () => {
    const actions = (await t.prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    for (const action of ['content.create', 'content.save', 'content.submit', 'content.publish', 'assignment.create', 'assignment.excuse', 'review.score']) {
      expect(actions).toContain(action);
    }
  });
});
