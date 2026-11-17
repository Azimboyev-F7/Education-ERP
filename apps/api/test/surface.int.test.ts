import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDb, seedOrg, startApp, type TestApp } from './harness.js';

/**
 * The smaller endpoints that the bigger suites pass by: listings, the content library, cancelling
 * and retiring, signing out. Every response is also checked against the published contract.
 */
describe('remaining endpoints', () => {
  let t: TestApp;
  let org: Awaited<ReturnType<typeof seedOrg>>;

  beforeAll(async () => {
    t = await startApp();
    await resetDb(t.prisma);
    org = await seedOrg(t.prisma);
  });
  afterAll(() => t.close());

  it('reports health without a session', async () => {
    const reply = await t.anonymous().get('/health');
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ status: 'ok' });
  });

  it('lists the branches each role can see', async () => {
    const admin = await t.as('admin');
    expect((await admin.get('/branches')).body.map((b: { name: string }) => b.name)).toEqual(['Main', 'North']);
    const manager = await t.as('manager');
    expect((await manager.get('/branches')).body.map((b: { name: string }) => b.name)).toEqual(['Main']);
  });

  it('runs a task set from draft to retired, and a student practises on it', async () => {
    const admin = await t.as('admin');
    const created = await admin.post('/task-sets', { title: 'Short reading', skill: 'READING' });
    const { id: taskSetId, versionId } = created.body;

    const saved = await admin.put(`/task-set-versions/${versionId}/content`, {
      sections: [
        {
          skill: 'READING',
          kind: 'READING_PASSAGE_1',
          stimuli: [{ kind: 'PASSAGE', text: 'The sun is a star.' }],
          groups: [
            {
              type: 'MULTIPLE_CHOICE',
              stimulusIndex: 0,
              questions: [
                {
                  number: 1,
                  prompt: { stem: 'The sun is', options: [{ id: 'A', text: 'a star' }, { id: 'B', text: 'a planet' }] },
                  answerKey: { correct: ['A'] },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(saved.status).toBe(200);
    // The staff view carries answer keys but none of the storage internals.
    expect(saved.body.sections[0].groups[0].questions[0].answerKey).toEqual({ correct: ['A'] });
    expect(JSON.stringify(saved.body)).not.toContain(org.center.id);

    expect((await admin.post(`/task-set-versions/${versionId}/submit`)).status).toBe(204);
    expect((await admin.post(`/task-set-versions/${versionId}/publish`)).status).toBe(204);

    const listed = await admin.get('/task-sets?skill=READING&q=short');
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].published.id).toBe(versionId);
    expect((await admin.get('/task-sets?q=nothing-matches')).body).toEqual([]);

    // A student practises on it alone, hands it in, and finds it in their history.
    const student = await t.as('s1');
    expect((await student.get('/practice/task-sets')).body[0].versionId).toBe(versionId);
    const started = await student.post('/attempts', { versionId });
    expect(started.status).toBe(201);
    const submitted = await student.post(`/attempts/${started.body.id}/submit`);
    expect(submitted.status).toBe(200);
    const history = await student.get('/my/attempts');
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ id: started.body.id, status: 'COMPLETED', source: 'SELF_PRACTICE' });

    // Assigned work can be cancelled and then disappears from lists.
    const assigned = await admin.post('/assignments', { versionId, kind: 'HOMEWORK', title: 'Read it', groupId: org.groupA.id });
    expect(assigned.status).toBe(201);
    expect((await admin.post(`/assignments/${assigned.body.id}/cancel`)).status).toBe(204);
    expect((await admin.get('/assignments')).body).toEqual([]);

    // Retiring takes it out of the practice catalogue.
    expect((await admin.post(`/task-set-versions/${versionId}/retire`)).status).toBe(204);
    expect((await student.get('/practice/task-sets')).body).toEqual([]);
    expect((await admin.post(`/task-sets/${taskSetId}/versions`)).status).toBe(201);
  });

  it('signs out, which ends the session', async () => {
    const teacher = await t.as('teacher.a');
    expect((await teacher.get('/auth/me')).status).toBe(200);
    expect((await teacher.post('/auth/logout')).status).toBe(204);
    expect((await teacher.get('/auth/me')).status).toBe(401);
  });
});
