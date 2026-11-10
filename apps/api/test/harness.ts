import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { OutboxService } from '../src/outbox/outbox.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PASSWORD = 'integration-test-only';

export interface TestApp {
  app: NestExpressApplication;
  url: string;
  prisma: PrismaService;
  outbox: OutboxService;
  /** Signs in and returns a client that carries the session cookie. */
  as(username: string): Promise<Client>;
  close(): Promise<void>;
}

export async function startApp(): Promise<TestApp> {
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  return {
    app,
    url,
    prisma: app.get(PrismaService),
    outbox: app.get(OutboxService),
    async as(username) {
      const client = new Client(url);
      await client.login(username);
      return client;
    },
    close: () => app.close(),
  };
}

export interface Reply<T = any> {
  status: number;
  body: T;
  /** Raw response text, for asserting that something is absent from the payload. */
  text: string;
}

export class Client {
  private cookie: string | undefined;

  constructor(private readonly base: string) {}

  async login(username: string): Promise<void> {
    const response = await fetch(`${this.base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    if (response.status !== 204) throw new Error(`Login as ${username} failed with ${response.status}`);
    this.cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  }

  get = <T = any>(path: string) => this.request<T>('GET', path);
  post = <T = any>(path: string, body?: unknown) => this.request<T>('POST', path, body);
  put = <T = any>(path: string, body?: unknown) => this.request<T>('PUT', path, body);

  private async request<T>(method: string, path: string, body?: unknown): Promise<Reply<T>> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, text, body: (text ? JSON.parse(text) : null) as T };
  }
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

/**
 * One centre with two branches:
 *   Main  — group A, taught by teacher.a, students s1 and s2; managed by `manager`
 *   North — group B, taught by teacher.b, student s3
 */
export async function seedOrg(prisma: PrismaService) {
  const passwordHash = await hashPassword(PASSWORD);
  const center = await prisma.center.create({ data: { name: 'Test Centre' } });
  const main = await prisma.branch.create({ data: { centerId: center.id, name: 'Main' } });
  const north = await prisma.branch.create({ data: { centerId: center.id, name: 'North' } });
  const course = await prisma.course.create({ data: { centerId: center.id, name: 'IELTS' } });

  const user = (username: string) =>
    prisma.user.create({ data: { centerId: center.id, username, fullName: username, passwordHash } });
  const student = async (username: string) => {
    const created = await user(username);
    await prisma.studentProfile.create({ data: { userId: created.id, targetBand: 6.5 } });
    return created;
  };

  const [admin, manager, teacherA, teacherB] = [await user('admin'), await user('manager'), await user('teacher.a'), await user('teacher.b')];
  await prisma.roleAssignment.createMany({
    data: [
      { userId: admin.id, role: 'ADMINISTRATOR' },
      { userId: manager.id, role: 'ACADEMIC_MANAGER', branchId: main.id },
      { userId: teacherA.id, role: 'TEACHER' },
      { userId: teacherB.id, role: 'TEACHER' },
    ],
  });

  const group = (name: string, branchId: string, teacherId: string) =>
    prisma.group.create({
      data: { centerId: center.id, branchId, courseId: course.id, name, teachers: { create: { userId: teacherId } } },
    });
  const groupA = await group('Group A', main.id, teacherA.id);
  const groupB = await group('Group B', north.id, teacherB.id);

  const [s1, s2, s3] = [await student('s1'), await student('s2'), await student('s3')];
  await prisma.enrollment.createMany({
    data: [
      { groupId: groupA.id, studentId: s1.id },
      { groupId: groupA.id, studentId: s2.id },
      { groupId: groupB.id, studentId: s3.id },
    ],
  });

  return { center, main, north, groupA, groupB, admin, manager, teacherA, teacherB, s1, s2, s3 };
}
