-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- A student can be enrolled in a group only once at a time. Prisma cannot express a partial
-- unique index, so it lives here; it makes concurrent "enrol" requests safe.
CREATE UNIQUE INDEX "Enrollment_one_active_per_group" ON "Enrollment"("groupId", "studentId") WHERE "endedOn" IS NULL;
