import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, PASSWORD, resetDb, seedOrg, startApp, type TestApp } from './harness.js';

type Org = Awaited<ReturnType<typeof seedOrg>>;

/** Every one-time password issued during the run, to prove none of them is ever logged. */
const issued: string[] = [];
const remember = <R extends { body: any }>(reply: R): R => {
  if (reply.body?.temporaryPassword) issued.push(reply.body.temporaryPassword);
  return reply;
};

let t: TestApp;

/** Registered by every block: when it ends, nothing in the audit log may contain an issued password. */
const assertNoPasswordsInAudit = async () => {
  const everything = JSON.stringify(await t.prisma.auditLog.findMany());
  for (const password of issued) expect(everything).not.toContain(password);
};

beforeAll(async () => {
  t = await startApp();
});

afterAll(async () => {
  await t.close();
});

/** Fresh centre and signed-in staff for each block, so blocks do not depend on one another. */
async function fresh() {
  await resetDb(t.prisma);
  const org = await seedOrg(t.prisma);
  const course = await t.prisma.course.findFirstOrThrow({ where: { name: 'IELTS' } });
  const [admin, manager, teacherA, teacherB] = [await t.as('admin'), await t.as('manager'), await t.as('teacher.a'), await t.as('teacher.b')];
  return { org, course, admin, manager, teacherA, teacherB };
}

describe('centre structure', () => {
  let org: Org, course: { id: string }, admin: Client, manager: Client, teacherA: Client;
  afterAll(assertNoPasswordsInAudit);

  beforeAll(async () => ({ org, course, admin, manager, teacherA } = await fresh()));

  it('lets only administrators create branches, courses, levels and periods', async () => {
    for (const client of [teacherA, manager]) {
      expect((await client.post('/branches', { name: 'East' })).status).toBe(403);
      expect((await client.post('/courses', { name: 'Pre-IELTS' })).status).toBe(403);
      expect((await client.post('/periods', { name: 'Spring', startsOn: '2027-02-01', endsOn: '2027-05-31' })).status).toBe(403);
    }
    expect((await admin.post('/branches', { name: 'East' })).status).toBe(201);
    expect((await admin.post('/branches', { name: 'East' })).status).toBe(409);
  });

  it('numbers levels in the order they are added and lists them to all staff', async () => {
    const { body } = await admin.post('/courses', { name: 'General English' });
    expect((await admin.post('/courses', { name: 'General English' })).status).toBe(409);

    expect((await admin.post(`/courses/${body.id}/levels`, { name: 'A1' })).status).toBe(201);
    expect((await admin.post(`/courses/${body.id}/levels`, { name: 'A2' })).status).toBe(201);
    expect((await admin.post(`/courses/${body.id}/levels`, { name: 'A1' })).status).toBe(409);
    expect((await admin.post('/courses/nope/levels', { name: 'B1' })).status).toBe(404);
    expect((await manager.post(`/courses/${body.id}/levels`, { name: 'B1' })).status).toBe(403);

    const courses = await teacherA.get('/courses');
    const english = courses.body.find((c: any) => c.name === 'General English');
    expect(english.levels.map((l: any) => [l.name, l.position])).toEqual([['A1', 0], ['A2', 1]]);
  });

  it('validates academic periods', async () => {
    expect((await admin.post('/periods', { name: 'Backwards', startsOn: '2027-05-31', endsOn: '2027-02-01' })).status).toBe(400);
    expect((await admin.post('/periods', { name: 'Bad', startsOn: '2027-13-40', endsOn: '2027-14-01' })).status).toBe(400);
    expect((await admin.post('/periods', { name: 'Spring', startsOn: '2027-02-01', endsOn: '2027-05-31' })).status).toBe(201);
    expect((await teacherA.get('/periods')).body.map((p: any) => p.name)).toContain('Spring');
  });

  it('lets a manager create groups in their own branch only, with a period', async () => {
    const period = (await t.prisma.academicPeriod.findFirstOrThrow()).id;
    const base = { name: 'Evening', courseId: course.id };
    expect((await manager.post('/groups', { ...base, branchId: org.north.id })).status).toBe(403);
    expect((await manager.post('/groups', { ...base, branchId: org.main.id, periodId: 'nope' })).status).toBe(404);
    expect((await manager.post('/groups', { ...base, branchId: org.main.id, periodId: period })).status).toBe(201);
    expect((await teacherA.post('/groups', { ...base, branchId: org.main.id })).status).toBe(403);
  });
});

describe('groups', () => {
  let org: Org, admin: Client, manager: Client, teacherA: Client, teacherB: Client;
  afterAll(assertNoPasswordsInAudit);

  beforeAll(async () => ({ org, admin, manager, teacherA, teacherB } = await fresh()));

  it('shows a group, its teachers and its roster to staff who can see it', async () => {
    const detail = await teacherA.get(`/groups/${org.groupA.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ name: 'Group A', canManage: false });
    expect(detail.body.teachers.map((x: any) => x.fullName)).toEqual(['teacher.a']);
    expect(detail.body.students.map((x: any) => x.fullName)).toEqual(['s1', 's2']);

    expect((await teacherB.get(`/groups/${org.groupA.id}`)).status).toBe(404);
    expect((await manager.get(`/groups/${org.groupA.id}`)).body.canManage).toBe(true);
    expect((await manager.get(`/groups/${org.groupB.id}`)).status).toBe(404);
    expect((await admin.get(`/groups/${org.groupB.id}`)).body.canManage).toBe(true);
  });

  it('renames and re-levels a group, checking the level belongs to its course', async () => {
    expect((await teacherA.patch(`/groups/${org.groupA.id}`, { name: 'Hacked' })).status).toBe(403);
    expect((await manager.patch(`/groups/${org.groupB.id}`, { name: 'Other branch' })).status).toBe(404);
    expect((await manager.patch(`/groups/${org.groupA.id}`, {})).status).toBe(400);

    expect((await manager.patch(`/groups/${org.groupA.id}`, { name: 'Group A (evening)' })).status).toBe(204);
    expect((await manager.get(`/groups/${org.groupA.id}`)).body.name).toBe('Group A (evening)');

    const other = await admin.post('/courses', { name: 'Other course' });
    const foreignLevel = await admin.post(`/courses/${other.body.id}/levels`, { name: 'X' });
    expect((await manager.patch(`/groups/${org.groupA.id}`, { levelId: foreignLevel.body.id })).status).toBe(404);

    const own = await admin.post(`/courses/${org.groupA.courseId}/levels`, { name: 'Band 6' });
    expect((await manager.patch(`/groups/${org.groupA.id}`, { levelId: own.body.id })).status).toBe(204);
    expect((await manager.get(`/groups/${org.groupA.id}`)).body.level.name).toBe('Band 6');
    expect((await manager.patch(`/groups/${org.groupA.id}`, { levelId: null })).status).toBe(204);
  });

  it('adds and removes teachers, and the teacher’s scope follows', async () => {
    expect((await teacherB.get('/groups')).body.map((g: any) => g.name)).toEqual(['Group B']);

    expect((await teacherA.put(`/groups/${org.groupA.id}/teachers`, { userId: org.teacherB.id })).status).toBe(403);
    expect((await manager.put(`/groups/${org.groupA.id}/teachers`, { userId: org.teacherB.id })).status).toBe(204);
    expect((await manager.put(`/groups/${org.groupA.id}/teachers`, { userId: org.teacherB.id })).status).toBe(204); // idempotent
    expect((await teacherB.get('/groups')).body.map((g: any) => g.name).sort()).toEqual(['Group A (evening)', 'Group B']);
    expect((await manager.get(`/groups/${org.groupA.id}`)).body.teachers).toHaveLength(2);

    // Only active people with the teacher role can be assigned.
    expect((await manager.put(`/groups/${org.groupA.id}/teachers`, { userId: org.admin.id })).status).toBe(404);
    expect((await manager.put(`/groups/${org.groupA.id}/teachers`, { userId: org.s1.id })).status).toBe(404);

    expect((await manager.delete(`/groups/${org.groupA.id}/teachers/${org.teacherB.id}`)).status).toBe(204);
    expect((await teacherB.get('/groups')).body.map((g: any) => g.name)).toEqual(['Group B']);
  });
});

describe('staff accounts and passwords', () => {
  let org: Org, admin: Client, manager: Client, teacherA: Client;
  let staffId: string;
  let tempPassword: string;
  afterAll(assertNoPasswordsInAudit);

  beforeAll(async () => ({ org, admin, manager, teacherA } = await fresh()));

  it('lists staff to administrators and managers only', async () => {
    expect((await teacherA.get('/staff')).status).toBe(403);
    const list = await manager.get('/staff');
    expect(list.status).toBe(200);
    expect(list.body.find((s: any) => s.username === 'teacher.a').groups.map((g: any) => g.name)).toEqual(['Group A']);
    expect(list.text).not.toContain('passwordHash');
  });

  it('lets only administrators create staff, validating the roles', async () => {
    const input = { username: 'New.Teacher', fullName: 'New Teacher', roles: [{ role: 'TEACHER' }] };
    expect((await manager.post('/staff', input)).status).toBe(403);
    expect((await teacherA.post('/staff', input)).status).toBe(403);

    expect((await admin.post('/staff', { ...input, username: 'x' })).status).toBe(400);
    expect((await admin.post('/staff', { ...input, roles: [] })).status).toBe(400);
    expect((await admin.post('/staff', { ...input, roles: [{ role: 'ACADEMIC_MANAGER' }] })).status).toBe(400); // needs a branch
    expect((await admin.post('/staff', { ...input, roles: [{ role: 'TEACHER', branchId: org.main.id }] })).status).toBe(400);
    expect((await admin.post('/staff', { ...input, roles: [{ role: 'ACADEMIC_MANAGER', branchId: 'nope' }] })).status).toBe(404);

    const created = remember(await admin.post('/staff', input));
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    expect(created.body.temporaryPassword).toHaveLength(14);
    ({ id: staffId, temporaryPassword: tempPassword } = created.body);

    // Usernames are stored lowercase and unique.
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: staffId } })).username).toBe('new.teacher');
    expect((await admin.post('/staff', { ...input, username: 'NEW.TEACHER' })).status).toBe(409);
    expect((await admin.post('/staff', { ...input, username: 'teacher.a' })).status).toBe(409);
  });

  it('confines a temporary password to changing it', async () => {
    const first = await t.as('NEW.TEACHER', tempPassword); // sign-in ignores letter case in the username
    const second = await t.as('new.teacher', tempPassword);

    const me = await first.get('/auth/me');
    expect(me.body).toMatchObject({ username: 'new.teacher', mustChangePassword: true });

    const blocked = await first.get('/groups');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await first.get('/reviews')).status).toBe(403);

    const change = (current: string, next: string) => first.post('/auth/password', { currentPassword: current, newPassword: next });
    expect((await change('wrong-current-password', 'a fresh passphrase 42')).status).toBe(400);
    expect((await change(tempPassword, 'short')).status).toBe(400);
    expect((await change(tempPassword, 'new.teacher-2027')).status).toBe(400); // contains the username
    expect((await change(tempPassword, tempPassword)).status).toBe(400);
    expect((await change(tempPassword, 'a fresh passphrase 42')).status).toBe(204);

    expect((await first.get('/auth/me')).body.mustChangePassword).toBe(false);
    expect((await first.get('/groups')).status).toBe(200);
    // Changing the password signs out every other session.
    expect((await second.get('/auth/me')).status).toBe(401);

    expect(await t.anonymous().login('new.teacher', tempPassword)).toBe(401);
    expect(await t.anonymous().login('new.teacher', 'a fresh passphrase 42')).toBe(204);
  });

  it('changes roles, and scope follows the roles', async () => {
    const staff = await t.as('new.teacher', 'a fresh passphrase 42');
    expect((await staff.get('/groups')).body).toHaveLength(0);

    expect((await manager.put(`/staff/${staffId}/roles`, { roles: [{ role: 'TEACHER' }] })).status).toBe(403);
    expect((await admin.put(`/staff/${staffId}/roles`, { roles: [{ role: 'ACADEMIC_MANAGER', branchId: 'nope' }] })).status).toBe(404);
    expect((await admin.put(`/staff/${org.s1.id}/roles`, { roles: [{ role: 'TEACHER' }] })).status).toBe(404); // students are not staff

    // As a manager of Main they see its groups straight away.
    expect((await admin.put(`/staff/${staffId}/roles`, { roles: [{ role: 'ACADEMIC_MANAGER', branchId: org.main.id }] })).status).toBe(204);
    expect((await staff.get('/groups')).body.map((g: any) => g.name)).toEqual(['Group A']);

    // Teaching a group, then losing the teacher role, releases the group.
    await admin.put(`/staff/${staffId}/roles`, { roles: [{ role: 'TEACHER' }, { role: 'ACADEMIC_MANAGER', branchId: org.main.id }] });
    expect((await admin.put(`/groups/${org.groupA.id}/teachers`, { userId: staffId })).status).toBe(204);
    expect(await t.prisma.groupTeacher.count({ where: { userId: staffId } })).toBe(1);
    await admin.put(`/staff/${staffId}/roles`, { roles: [{ role: 'ACADEMIC_MANAGER', branchId: org.main.id }] });
    expect(await t.prisma.groupTeacher.count({ where: { userId: staffId } })).toBe(0);
  });

  it('renames staff, administrators only', async () => {
    expect((await manager.patch(`/staff/${staffId}`, { fullName: 'Nope' })).status).toBe(403);
    expect((await admin.patch(`/staff/${staffId}`, { fullName: 'Renamed Teacher' })).status).toBe(204);
    expect((await admin.get('/staff')).body.find((s: any) => s.id === staffId).fullName).toBe('Renamed Teacher');
  });
});

describe('students', () => {
  let org: Org, admin: Client, manager: Client, teacherA: Client, teacherB: Client;
  let looseId: string;
  let freshId: string;
  let freshPassword: string;
  afterAll(assertNoPasswordsInAudit);

  beforeAll(async () => ({ org, admin, manager, teacherA, teacherB } = await fresh()));

  it('creates students: administrators anywhere, managers into their own branch, teachers never', async () => {
    const input = { username: 'Fresh.Student', fullName: 'Fresh Student', groupId: org.groupA.id, targetBand: 7, examDate: '2027-03-01' };

    expect((await teacherA.post('/students', input)).status).toBe(403);
    expect((await manager.post('/students', { ...input, groupId: undefined })).status).toBe(400); // a manager must choose a group
    expect((await manager.post('/students', { ...input, groupId: org.groupB.id })).status).toBe(404); // not their branch
    expect((await manager.post('/students', { ...input, groupId: 'nope' })).status).toBe(404);
    expect((await manager.post('/students', { ...input, targetBand: 6.3 })).status).toBe(400);
    expect((await manager.post('/students', { ...input, examDate: '2027-13-40' })).status).toBe(400);

    const created = remember(await manager.post('/students', input));
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    ({ id: freshId, temporaryPassword: freshPassword } = created.body);
    expect((await manager.post('/students', input)).status).toBe(409);

    const loose = remember(await admin.post('/students', { username: 'loose.student', fullName: 'Loose Student' }));
    expect(loose.status).toBe(201);
    looseId = loose.body.id;

    const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: freshId }, include: { studentProfile: true, enrollments: true } });
    expect(stored.username).toBe('fresh.student');
    expect(stored.studentProfile).toMatchObject({ targetBand: 7, module: 'ACADEMIC' });
    expect(stored.enrollments).toHaveLength(1);
  });

  it('makes the new student sign in, choose a password, and appear in the roster', async () => {
    const student = await t.as('fresh.student', freshPassword);
    expect((await student.get('/my/assignments')).status).toBe(403); // must change the password first
    expect(
      (await student.post('/auth/password', { currentPassword: freshPassword, newPassword: 'my own long passphrase' })).status,
    ).toBe(204);
    expect((await student.get('/my/assignments')).body).toEqual([]);

    expect((await teacherA.get(`/groups/${org.groupA.id}`)).body.students.map((s: any) => s.fullName)).toContain('Fresh Student');
    expect((await teacherA.get('/students')).body.map((s: any) => s.username)).toContain('fresh.student');
    expect((await teacherB.get('/students')).body.map((s: any) => s.username)).not.toContain('fresh.student');
  });

  it('shows a student’s profile only to staff who can see them', async () => {
    const detail = await teacherA.get(`/students/${freshId}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ username: 'fresh.student', status: 'ACTIVE', profile: { targetBand: 7, module: 'ACADEMIC' } });
    expect(detail.body.groups.map((g: any) => g.name)).toEqual(['Group A']);
    expect(detail.text).not.toContain('passwordHash');

    expect((await teacherB.get(`/students/${freshId}`)).status).toBe(404);
    expect((await manager.get(`/students/${looseId}`)).status).toBe(404); // in no group, so only administrators see them
    expect((await admin.get(`/students/${looseId}`)).status).toBe(200);
    expect((await (await t.as('s1')).get(`/students/${freshId}`)).status).toBe(403);
    expect((await teacherA.get(`/students/${org.admin.id}`)).status).toBe(404); // not a student
  });

  it('lets teachers set goals but not rename, and managers do both', async () => {
    expect((await teacherA.patch(`/students/${freshId}`, { targetBand: 7.5, examDate: '2027-04-10', module: 'GENERAL' })).status).toBe(204);
    expect((await teacherA.get(`/students/${freshId}`)).body.profile).toMatchObject({ targetBand: 7.5, module: 'GENERAL' });

    expect((await teacherA.patch(`/students/${freshId}`, { fullName: 'Renamed' })).status).toBe(403);
    expect((await teacherB.patch(`/students/${freshId}`, { targetBand: 5 })).status).toBe(404);
    expect((await teacherA.patch(`/students/${freshId}`, { targetBand: 6.3 })).status).toBe(400);
    expect((await teacherA.patch(`/students/${freshId}`, {})).status).toBe(400);

    expect((await manager.patch(`/students/${freshId}`, { fullName: 'Renamed Student', targetBand: null })).status).toBe(204);
    expect((await teacherA.get(`/students/${freshId}`)).body).toMatchObject({ fullName: 'Renamed Student', profile: { targetBand: null } });
  });
});

describe('enrolment', () => {
  let org: Org, admin: Client, manager: Client, teacherA: Client, teacherB: Client;
  let course: { id: string };
  let looseId: string;
  afterAll(assertNoPasswordsInAudit);

  const activeIn = (groupId: string, studentId: string) =>
    t.prisma.enrollment.count({ where: { groupId, studentId, endedOn: null } });

  beforeAll(async () => {
    ({ org, course, admin, manager, teacherA, teacherB } = await fresh());
    looseId = remember(await admin.post('/students', { username: 'loose.student', fullName: 'Loose Student' })).body.id;
  });

  it('enrols students, managers within their branch only', async () => {
    expect((await teacherA.post(`/groups/${org.groupA.id}/students`, { studentId: looseId })).status).toBe(403);
    expect((await manager.post(`/groups/${org.groupB.id}/students`, { studentId: looseId })).status).toBe(404);
    expect((await manager.post(`/groups/${org.groupA.id}/students`, { studentId: 'nope' })).status).toBe(404);
    // A student already placed in another branch is not the manager's to move around.
    expect((await manager.post(`/groups/${org.groupA.id}/students`, { studentId: org.s3.id })).status).toBe(404);

    expect((await manager.post(`/groups/${org.groupA.id}/students`, { studentId: looseId })).status).toBe(204);
    expect((await manager.post(`/groups/${org.groupA.id}/students`, { studentId: looseId })).status).toBe(409);
    expect((await teacherA.get(`/groups/${org.groupA.id}`)).body.students.map((s: any) => s.fullName)).toContain('Loose Student');

    // Administrators can place a student in a second group.
    expect((await admin.post(`/groups/${org.groupA.id}/students`, { studentId: org.s3.id })).status).toBe(204);
    expect((await teacherA.get('/students')).body.map((s: any) => s.username)).toContain('s3');
  });

  it('ends an enrolment by date and keeps the history', async () => {
    expect((await teacherA.post(`/groups/${org.groupA.id}/students/${org.s2.id}/remove`)).status).toBe(403);
    expect((await manager.post(`/groups/${org.groupA.id}/students/${org.s2.id}/remove`)).status).toBe(204);
    expect((await manager.post(`/groups/${org.groupA.id}/students/${org.s2.id}/remove`)).status).toBe(404);
    expect((await teacherA.get(`/groups/${org.groupA.id}`)).body.students.map((s: any) => s.fullName)).not.toContain('s2');

    expect((await manager.post(`/groups/${org.groupA.id}/students`, { studentId: org.s2.id })).status).toBe(204);
    const rows = await t.prisma.enrollment.findMany({ where: { studentId: org.s2.id, groupId: org.groupA.id } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.endedOn === null)).toHaveLength(1);
  });

  it('transfers a student between groups in one step', async () => {
    expect((await manager.post(`/students/${org.s1.id}/transfer`, { fromGroupId: org.groupA.id, toGroupId: org.groupB.id })).status).toBe(404);
    expect(await activeIn(org.groupA.id, org.s1.id)).toBe(1); // nothing happened
    expect((await admin.post(`/students/${org.s1.id}/transfer`, { fromGroupId: org.groupA.id, toGroupId: org.groupA.id })).status).toBe(400);

    expect((await admin.post(`/students/${org.s1.id}/transfer`, { fromGroupId: org.groupA.id, toGroupId: org.groupB.id })).status).toBe(204);
    expect(await activeIn(org.groupA.id, org.s1.id)).toBe(0);
    expect(await activeIn(org.groupB.id, org.s1.id)).toBe(1);
    expect((await teacherB.get(`/students/${org.s1.id}`)).status).toBe(200);
    expect((await teacherA.get(`/students/${org.s1.id}`)).status).toBe(404);

    expect((await admin.post(`/students/${org.s1.id}/transfer`, { fromGroupId: org.groupA.id, toGroupId: org.groupB.id })).status).toBe(404);
  });

  it('rolls a transfer back when the student is already in the target group', async () => {
    await admin.post(`/groups/${org.groupA.id}/students`, { studentId: org.s1.id }); // s1 is now in both
    const reply = await admin.post(`/students/${org.s1.id}/transfer`, { fromGroupId: org.groupB.id, toGroupId: org.groupA.id });
    expect(reply.status).toBe(409);
    expect(await activeIn(org.groupB.id, org.s1.id)).toBe(1); // still there
  });

  it('allows exactly one of many simultaneous identical enrolments', async () => {
    const student = remember(await admin.post('/students', { username: 'racer', fullName: 'Racer' })).body.id;
    const replies = await Promise.all(
      Array.from({ length: 6 }, () => admin.post(`/groups/${org.groupB.id}/students`, { studentId: student })),
    );
    expect(replies.map((r) => r.status).sort()).toEqual([204, 409, 409, 409, 409, 409]);
    expect(await activeIn(org.groupB.id, student)).toBe(1);
  });

  it('archives a group, releasing its students and freezing it', async () => {
    const temp = (await admin.post('/groups', { name: 'Temp', branchId: org.main.id, courseId: course.id })).body.id;
    await admin.post(`/groups/${temp}/students`, { studentId: looseId });
    expect((await teacherB.post(`/groups/${temp}/archive`)).status).toBe(404);

    expect((await admin.post(`/groups/${temp}/archive`)).status).toBe(204);
    expect((await admin.get('/groups')).body.map((g: any) => g.name)).not.toContain('Temp');
    expect(await activeIn(temp, looseId)).toBe(0);
    expect(await t.prisma.enrollment.count({ where: { groupId: temp, studentId: looseId } })).toBe(1); // history kept

    expect((await admin.post(`/groups/${temp}/archive`)).status).toBe(409);
    expect((await admin.post(`/groups/${temp}/students`, { studentId: looseId })).status).toBe(409);
    expect((await admin.patch(`/groups/${temp}`, { name: 'Renamed' })).status).toBe(409);
  });
});

describe('account lifecycle', () => {
  let org: Org, admin: Client, manager: Client, teacherA: Client;
  afterAll(assertNoPasswordsInAudit);

  beforeAll(async () => ({ org, admin, manager, teacherA } = await fresh()));

  it('disables and re-enables a student, signing them out at once', async () => {
    const s1 = await t.as('s1');
    expect((await s1.get('/my/assignments')).status).toBe(200);

    expect((await teacherA.post(`/users/${org.s1.id}/disable`)).status).toBe(403);
    expect((await manager.post(`/users/${org.s3.id}/disable`)).status).toBe(404); // another branch
    expect((await manager.post('/users/nope/disable')).status).toBe(403); // not a student, so staff territory
    expect((await admin.post('/users/nope/disable')).status).toBe(404);

    expect((await manager.post(`/users/${org.s1.id}/disable`)).status).toBe(204);
    expect((await s1.get('/my/assignments')).status).toBe(401);
    expect(await t.anonymous().login('s1')).toBe(401);
    expect((await admin.post(`/groups/${org.groupB.id}/students`, { studentId: org.s1.id })).status).toBe(409); // cannot enrol a disabled account

    expect((await manager.post(`/users/${org.s1.id}/enable`)).status).toBe(204);
    expect(await t.anonymous().login('s1')).toBe(204);
  });

  it('keeps staff accounts for administrators', async () => {
    expect((await manager.post(`/users/${org.teacherA.id}/disable`)).status).toBe(403);
    expect((await manager.post(`/users/${org.teacherA.id}/reset-password`)).status).toBe(403);
    expect((await admin.post(`/users/${org.admin.id}/disable`)).status).toBe(400); // not yourself
    expect((await admin.post(`/users/${org.admin.id}/reset-password`)).status).toBe(400);

    expect((await admin.post(`/users/${org.teacherA.id}/disable`)).status).toBe(204);
    expect((await teacherA.get('/groups')).status).toBe(401);
    expect(await t.anonymous().login('teacher.a')).toBe(401);
    expect((await admin.post(`/users/${org.teacherA.id}/enable`)).status).toBe(204);
    teacherA = await t.as('teacher.a'); // the old session was ended by the disable
  });

  it('resets a password to a one-time value, signs the person out, and forces a new one', async () => {
    const s2 = await t.as('s2');
    expect((await teacherA.post(`/users/${org.s2.id}/reset-password`)).status).toBe(403);

    const reset = remember(await manager.post(`/users/${org.s2.id}/reset-password`));
    expect(reset.status).toBe(200);
    expect(reset.headers.get('cache-control')).toBe('no-store');
    expect(reset.body.temporaryPassword).toHaveLength(14);

    expect((await s2.get('/my/assignments')).status).toBe(401);
    expect(await t.anonymous().login('s2', PASSWORD)).toBe(401);
    const again = await t.as('s2', reset.body.temporaryPassword);
    expect((await again.get('/auth/me')).body.mustChangePassword).toBe(true);

    const admins = remember(await admin.post(`/users/${org.teacherB.id}/reset-password`));
    expect(admins.status).toBe(200);
  });

  it('never lets the centre lose its last active administrator', async () => {
    // Alone, the administrator cannot demote themselves.
    expect((await admin.put(`/staff/${org.admin.id}/roles`, { roles: [{ role: 'TEACHER' }] })).status).toBe(409);

    const second = remember(await admin.post('/staff', { username: 'second.admin', fullName: 'Second Admin', roles: [{ role: 'ADMINISTRATOR' }] }));
    const secondClient = await t.as('second.admin', second.body.temporaryPassword);
    await secondClient.post('/auth/password', { currentPassword: second.body.temporaryPassword, newPassword: 'the second admin passphrase' });

    // With two, either can disable the other, but not themselves, and not the last one standing.
    expect((await secondClient.post(`/users/${org.admin.id}/disable`)).status).toBe(204);
    expect((await admin.get('/auth/me')).status).toBe(401);
    expect((await secondClient.post(`/users/${second.body.id}/disable`)).status).toBe(400);
    expect((await secondClient.put(`/staff/${second.body.id}/roles`, { roles: [{ role: 'TEACHER' }] })).status).toBe(409);

    expect((await secondClient.post(`/users/${org.admin.id}/enable`)).status).toBe(204);
    expect((await secondClient.put(`/staff/${second.body.id}/roles`, { roles: [{ role: 'TEACHER' }] })).status).toBe(204);
    // Their own session still works; they simply are no longer an administrator.
    expect((await secondClient.post('/branches', { name: 'Nope' })).status).toBe(403);
  });

  it('survives two administrators disabling each other at the same moment', async () => {
    await t.prisma.roleAssignment.create({ data: { userId: org.teacherB.id, role: 'ADMINISTRATOR' } });
    await t.prisma.roleAssignment.deleteMany({ where: { userId: org.teacherB.id, role: 'TEACHER' } });
    await t.prisma.user.update({ where: { id: org.teacherB.id }, data: { mustChangePassword: false, passwordHash: (await t.prisma.user.findUniqueOrThrow({ where: { id: org.admin.id } })).passwordHash } });
    const [a, b] = [await t.as('admin'), await t.as('teacher.b')];

    const replies = await Promise.all([a.post(`/users/${org.teacherB.id}/disable`), b.post(`/users/${org.admin.id}/disable`)]);
    // Whatever order they ran in, one succeeded and the other was refused; one administrator remains.
    expect(replies.filter((r) => r.status === 204)).toHaveLength(1);
    expect(replies.filter((r) => r.status !== 204)).toHaveLength(1);
    const active = await t.prisma.user.count({
      where: { centerId: org.center.id, status: 'ACTIVE', roleAssignments: { some: { role: 'ADMINISTRATOR' } } },
    });
    expect(active).toBe(1);
  });
});

describe('audit trail', () => {
  it('records account changes by who did them', async () => {
    const actions = new Set((await t.prisma.auditLog.findMany()).map((r) => r.action));
    for (const action of ['staff.create', 'user.reset_password', 'user.disable', 'user.enable']) expect(actions).toContain(action);
    expect(issued.length).toBeGreaterThan(3); // the no-password check above had real passwords to look for
  });
});
