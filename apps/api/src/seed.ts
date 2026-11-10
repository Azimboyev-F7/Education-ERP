/**
 * Local development data: one centre, two branches, one IELTS course, staff in each role
 * and a handful of students. Refuses to run against a database that already has a centre.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './auth/password.js';
import { PrismaClient } from './generated/prisma/client.js';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const password = process.env.SEED_PASSWORD;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  if (!password) throw new Error('SEED_PASSWORD is not set (see .env.example)');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if ((await prisma.center.count()) > 0) {
      console.log('Database already has data; seed skipped.');
      return;
    }
    const passwordHash = await hashPassword(password);

    const center = await prisma.center.create({ data: { name: 'Demo English Centre' } });
    const branch = (name: string) => prisma.branch.create({ data: { centerId: center.id, name } });
    const main = await branch('Main Branch');
    const north = await branch('North Branch');

    const course = await prisma.course.create({
      data: {
        centerId: center.id,
        name: 'IELTS',
        levels: {
          create: ['Foundation', 'Band 5.5-6.5', 'Band 7+'].map((name, position) => ({ name, position })),
        },
      },
      include: { levels: { orderBy: { position: 'asc' } } },
    });
    const [foundation, middle, upper] = course.levels;
    if (!foundation || !middle || !upper) throw new Error('Levels were not created');

    const year = new Date().getFullYear();
    const period = await prisma.academicPeriod.create({
      data: {
        centerId: center.id,
        name: `${year} Autumn`,
        startsOn: new Date(`${year}-09-01`),
        endsOn: new Date(`${year}-12-31`),
      },
    });

    const user = (username: string, fullName: string) =>
      prisma.user.create({ data: { centerId: center.id, username, fullName, passwordHash } });

    const admin = await user('admin', 'Centre Administrator');
    const manager = await user('manager.main', 'Main Branch Manager');
    const teacherA = await user('teacher.a', 'Teacher A');
    const teacherB = await user('teacher.b', 'Teacher B');
    await prisma.roleAssignment.createMany({
      data: [
        { userId: admin.id, role: 'ADMINISTRATOR' },
        { userId: manager.id, role: 'ACADEMIC_MANAGER', branchId: main.id },
        { userId: teacherA.id, role: 'TEACHER' },
        { userId: teacherB.id, role: 'TEACHER' },
      ],
    });

    const group = (name: string, branchId: string, levelId: string, teacherId: string) =>
      prisma.group.create({
        data: {
          centerId: center.id,
          branchId,
          courseId: course.id,
          levelId,
          periodId: period.id,
          name,
          teachers: { create: { userId: teacherId } },
        },
      });
    const groups = [
      await group('IELTS Foundation - Mon/Wed', main.id, foundation.id, teacherA.id),
      await group('IELTS 6.5 - Tue/Thu', main.id, middle.id, teacherB.id),
      await group('IELTS 7+ - Sat', north.id, upper.id, teacherB.id),
    ];

    for (let i = 1; i <= 9; i++) {
      const student = await user(`student${i}`, `Student ${i}`);
      const target = groups[(i - 1) % groups.length];
      if (!target) throw new Error('No group to enrol into');
      await prisma.studentProfile.create({ data: { userId: student.id, targetBand: 6 + (i % 3) * 0.5 } });
      await prisma.enrollment.create({ data: { groupId: target.id, studentId: student.id } });
    }

    console.log('Seeded: admin, manager.main, teacher.a, teacher.b, student1..student9 (password from SEED_PASSWORD).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
