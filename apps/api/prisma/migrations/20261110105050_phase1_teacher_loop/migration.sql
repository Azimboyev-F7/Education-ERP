-- CreateEnum
CREATE TYPE "Skill" AS ENUM ('LISTENING', 'READING', 'WRITING', 'SPEAKING');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "StimulusKind" AS ENUM ('PASSAGE', 'AUDIO', 'IMAGE', 'CUE_CARD');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('CLASSWORK', 'HOMEWORK', 'LEVEL_CHECK', 'EXAM');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('ASSIGNED', 'STARTED', 'AWAITING_REVIEW', 'COMPLETED', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttemptSource" AS ENUM ('ASSIGNMENT', 'SELF_PRACTICE');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'AWAITING_REVIEW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'DONE');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('AUTO_SCORED', 'TEACHER_ASSESSED', 'OFFICIAL_RESULT');

-- CreateTable
CREATE TABLE "TaskSet" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "skill" "Skill",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "TaskSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSetVersion" (
    "id" TEXT NOT NULL,
    "taskSetId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "difficulty" INTEGER,
    "timeLimitSec" INTEGER,
    "fullLength" BOOLEAN NOT NULL DEFAULT false,
    "module" "IeltsModule",
    "tags" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "TaskSetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "skill" "Skill" NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "instructions" TEXT,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stimulus" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "StimulusKind" NOT NULL,
    "title" TEXT,
    "text" TEXT,
    "fileKey" TEXT,
    "transcript" TEXT,

    CONSTRAINT "Stimulus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionGroup" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "stimulusId" TEXT,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "instructions" TEXT,
    "config" JSONB NOT NULL,

    CONSTRAINT "QuestionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "prompt" JSONB NOT NULL,
    "answerKey" JSONB,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "groupId" TEXT,
    "kind" "AssignmentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "opensAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "timeLimitSec" INTEGER,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentRecipient" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'ASSIGNED',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssignmentRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "source" "AttemptSource" NOT NULL,
    "recipientId" TEXT,
    "timed" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "bandEstimate" DOUBLE PRECISION,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "timeSpentMs" INTEGER NOT NULL DEFAULT 0,
    "changeCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTask" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skill" "Skill" NOT NULL,
    "taskType" TEXT NOT NULL,
    "rubricKey" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "criteria" JSONB,
    "overallBand" DOUBLE PRECISION,
    "comment" TEXT,
    "nextStep" TEXT,

    CONSTRAINT "ReviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillEvidence" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT,
    "skill" "Skill" NOT NULL,
    "taskType" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "source" "AttemptSource",
    "timed" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "band" DOUBLE PRECISION,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "attemptId" TEXT,
    "versionId" TEXT,

    CONSTRAINT "SkillEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskSet_centerId_idx" ON "TaskSet"("centerId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSetVersion_taskSetId_number_key" ON "TaskSetVersion"("taskSetId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Section_versionId_position_key" ON "Section"("versionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Stimulus_sectionId_position_key" ON "Stimulus"("sectionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionGroup_sectionId_position_key" ON "QuestionGroup"("sectionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Question_groupId_position_key" ON "Question"("groupId", "position");

-- CreateIndex
CREATE INDEX "Assignment_centerId_groupId_idx" ON "Assignment"("centerId", "groupId");

-- CreateIndex
CREATE INDEX "AssignmentRecipient_studentId_idx" ON "AssignmentRecipient"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentRecipient_assignmentId_studentId_key" ON "AssignmentRecipient"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "Attempt_studentId_status_idx" ON "Attempt"("studentId", "status");

-- CreateIndex
CREATE INDEX "Attempt_recipientId_idx" ON "Attempt"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_attemptId_questionId_key" ON "Response"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTask_responseId_key" ON "ReviewTask"("responseId");

-- CreateIndex
CREATE INDEX "ReviewTask_centerId_status_createdAt_idx" ON "ReviewTask"("centerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewTask_studentId_idx" ON "ReviewTask"("studentId");

-- CreateIndex
CREATE INDEX "SkillEvidence_studentId_skill_occurredAt_idx" ON "SkillEvidence"("studentId", "skill", "occurredAt");

-- CreateIndex
CREATE INDEX "SkillEvidence_groupId_occurredAt_idx" ON "SkillEvidence"("groupId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SkillEvidence_attemptId_skill_taskType_kind_key" ON "SkillEvidence"("attemptId", "skill", "taskType", "kind");

-- CreateIndex
CREATE INDEX "OutboxEvent_processedAt_failedAt_availableAt_idx" ON "OutboxEvent"("processedAt", "failedAt", "availableAt");

-- AddForeignKey
ALTER TABLE "TaskSetVersion" ADD CONSTRAINT "TaskSetVersion_taskSetId_fkey" FOREIGN KEY ("taskSetId") REFERENCES "TaskSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TaskSetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stimulus" ADD CONSTRAINT "Stimulus_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionGroup" ADD CONSTRAINT "QuestionGroup_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionGroup" ADD CONSTRAINT "QuestionGroup_stimulusId_fkey" FOREIGN KEY ("stimulusId") REFERENCES "Stimulus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "QuestionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TaskSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRecipient" ADD CONSTRAINT "AssignmentRecipient_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRecipient" ADD CONSTRAINT "AssignmentRecipient_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TaskSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "AssignmentRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;
