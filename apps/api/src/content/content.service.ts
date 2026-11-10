import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateTaskSetRequest,
  SECTION_KINDS,
  type TaskSetQuery,
  type VersionContentInput,
} from '@erp/contracts';
import { FULL_TEST_QUESTIONS, parseGroupConfig, parseQuestion, questionType } from '@erp/scoring';
import { canApproveContent, canAuthorContent, canEditDraft } from '../access/access.policy.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { type ContentStatus, Prisma } from '../generated/prisma/client.js';
import type { Tx } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { flattenQuestions, type VersionTree, versionTree } from './content.tree.js';

interface ValidGroup {
  type: string;
  instructions: string | undefined;
  config: Prisma.InputJsonValue;
  stimulusIndex: number | undefined;
  questions: {
    number: number;
    prompt: Prisma.InputJsonValue;
    answerKey: Prisma.InputJsonValue | typeof Prisma.DbNull;
    explanation: string | undefined;
    points: number;
  }[];
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: Principal, input: CreateTaskSetRequest): Promise<{ id: string; versionId: string }> {
    if (!canAuthorContent(user)) throw new ForbiddenException();
    const set = await this.prisma.taskSet.create({
      data: {
        centerId: user.centerId,
        title: input.title,
        skill: input.skill,
        createdById: user.userId,
        versions: { create: { number: 1, createdById: user.userId } },
      },
      include: { versions: { select: { id: true } } },
    });
    const versionId = set.versions[0]!.id;
    await this.record(user, 'content.create', versionId, { title: input.title });
    return { id: set.id, versionId };
  }

  async list(user: Principal, query: TaskSetQuery) {
    if (!canAuthorContent(user)) throw new ForbiddenException();
    const sets = await this.prisma.taskSet.findMany({
      where: {
        centerId: user.centerId,
        archivedAt: null,
        ...(query.skill ? { skill: query.skill } : {}),
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
        ...(query.status ? { versions: { some: { status: query.status } } } : {}),
      },
      include: {
        versions: {
          orderBy: { number: 'desc' },
          select: { id: true, number: true, status: true, difficulty: true, tags: true, publishedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return sets.map((set) => ({
      id: set.id,
      title: set.title,
      skill: set.skill,
      createdById: set.createdById,
      latest: set.versions[0] ?? null,
      /** The version students can currently be given. */
      published: set.versions.find((v) => v.status === 'PUBLISHED') ?? null,
    }));
  }

  /** Staff view of one version, including answer keys. */
  async getVersion(user: Principal, versionId: string): Promise<VersionTree> {
    if (!canAuthorContent(user)) throw new ForbiddenException();
    return this.load(user.centerId, versionId);
  }

  /** Replaces the whole body of a draft. Saving is atomic: either all of it is stored or none. */
  async saveContent(user: Principal, versionId: string, input: VersionContentInput): Promise<VersionTree> {
    const version = await this.load(user.centerId, versionId);
    if (version.status !== 'DRAFT') {
      throw new ConflictException('Only drafts can be edited. Create a new version to change published content.');
    }
    if (!canEditDraft(user, version.createdById)) throw new ForbiddenException();

    const sections = this.validate(input);
    await this.prisma.$transaction((tx) => this.write(tx, versionId, input, sections));
    await this.record(user, 'content.save', versionId, { sections: input.sections.length });
    return this.load(user.centerId, versionId);
  }

  async submitForReview(user: Principal, versionId: string): Promise<void> {
    const version = await this.load(user.centerId, versionId);
    if (!canEditDraft(user, version.createdById)) throw new ForbiddenException();
    if (version.sections.length === 0) throw new BadRequestException('Add at least one section before submitting');
    await this.transition(user, versionId, 'DRAFT', 'IN_REVIEW', 'content.submit');
  }

  async returnToDraft(user: Principal, versionId: string): Promise<void> {
    if (!canApproveContent(user)) throw new ForbiddenException();
    await this.load(user.centerId, versionId);
    await this.transition(user, versionId, 'IN_REVIEW', 'DRAFT', 'content.return');
  }

  async publish(user: Principal, versionId: string): Promise<void> {
    if (!canApproveContent(user)) throw new ForbiddenException();
    const version = await this.load(user.centerId, versionId);
    if (version.fullLength) this.checkFullLength(version);
    await this.transition(user, versionId, 'IN_REVIEW', 'PUBLISHED', 'content.publish', {
      publishedAt: new Date(),
      publishedById: user.userId,
    });
    // One published version per task set: the newly approved one replaces its predecessor.
    // Work already assigned on the old version carries on against that version.
    await this.prisma.taskSetVersion.updateMany({
      where: { taskSetId: version.taskSetId, status: 'PUBLISHED', id: { not: versionId } },
      data: { status: 'RETIRED', retiredAt: new Date() },
    });
  }

  /** Retired versions can no longer be assigned or practised; existing results are untouched. */
  async retire(user: Principal, versionId: string): Promise<void> {
    if (!canApproveContent(user)) throw new ForbiddenException();
    await this.load(user.centerId, versionId);
    await this.transition(user, versionId, 'PUBLISHED', 'RETIRED', 'content.retire', { retiredAt: new Date() });
  }

  /** Starts a new draft as a copy of the latest version, leaving published versions as they are. */
  async newVersion(user: Principal, taskSetId: string): Promise<{ versionId: string }> {
    if (!canAuthorContent(user)) throw new ForbiddenException();
    const set = await this.prisma.taskSet.findFirst({
      where: { id: taskSetId, centerId: user.centerId },
      include: { versions: { orderBy: { number: 'desc' }, select: { id: true, number: true, status: true } } },
    });
    const latest = set?.versions[0];
    if (!set || !latest) throw new NotFoundException('Task set not found');
    if (set.versions.some((v) => v.status === 'DRAFT' || v.status === 'IN_REVIEW')) {
      throw new ConflictException('This task set already has an unpublished version');
    }

    const source = await this.load(user.centerId, latest.id);
    const input = toInput(source);
    const sections = this.validate(input);
    const versionId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskSetVersion.create({
        data: { taskSetId, number: latest.number + 1, createdById: user.userId },
        select: { id: true },
      });
      await this.write(tx, created.id, input, sections);
      return created.id;
    });
    await this.record(user, 'content.new_version', versionId, { from: latest.id });
    return { versionId };
  }

  // ───────────────────────── internals ─────────────────────────

  private async load(centerId: string, versionId: string): Promise<VersionTree> {
    const version = await this.prisma.taskSetVersion.findFirst({
      where: { id: versionId, taskSet: { centerId } },
      include: versionTree,
    });
    if (!version) throw new NotFoundException('Version not found');
    return version;
  }

  /** Validates the document against the question-type registry and returns storable values. */
  private validate(input: VersionContentInput): ValidGroup[][] {
    const numbers = new Set<number>();
    const fail = (where: string, problem: string): never => {
      throw new BadRequestException({ message: 'Content is not valid', issues: [{ path: where, message: problem }] });
    };

    return input.sections.map((section, s) => {
      const kinds: readonly string[] = SECTION_KINDS[section.skill];
      if (!kinds.includes(section.kind)) fail(`sections.${s}.kind`, `Not a ${section.skill} section kind`);

      return section.groups.map((group, g) => {
        const at = `sections.${s}.groups.${g}`;
        const def = questionType(group.type);
        if (!def) fail(`${at}.type`, `Unknown question type "${group.type}"`);
        if (group.stimulusIndex !== undefined && group.stimulusIndex >= section.stimuli.length) {
          fail(`${at}.stimulusIndex`, 'No such stimulus in this section');
        }
        const config = parseGroupConfig(group.type, group.config);
        if (!config.ok) return fail(`${at}.config`, config.problem);

        const questions = group.questions.map((question, q) => {
          if (numbers.has(question.number)) fail(`${at}.questions.${q}.number`, 'Question numbers must be unique');
          numbers.add(question.number);
          const parsed = parseQuestion(group.type, config.value, question.prompt, question.answerKey);
          if (!parsed.ok) return fail(`${at}.questions.${q}`, parsed.problem);
          return {
            number: question.number,
            prompt: parsed.value.prompt as Prisma.InputJsonValue,
            answerKey: parsed.value.answerKey === null ? Prisma.DbNull : (parsed.value.answerKey as Prisma.InputJsonValue),
            explanation: question.explanation,
            points: question.points,
          };
        });
        return {
          type: group.type,
          instructions: group.instructions,
          config: config.value as Prisma.InputJsonValue,
          stimulusIndex: group.stimulusIndex,
          questions,
        };
      });
    });
  }

  private async write(tx: Tx, versionId: string, input: VersionContentInput, sections: ValidGroup[][]): Promise<void> {
    await tx.section.deleteMany({ where: { versionId } });
    await tx.taskSetVersion.update({
      where: { id: versionId },
      data: {
        difficulty: input.difficulty ?? null,
        timeLimitSec: input.timeLimitSec ?? null,
        fullLength: input.fullLength,
        module: input.module ?? null,
        tags: input.tags,
      },
    });

    for (const [s, section] of input.sections.entries()) {
      const created = await tx.section.create({
        data: {
          versionId,
          position: s,
          skill: section.skill,
          kind: section.kind,
          title: section.title,
          instructions: section.instructions,
          stimuli: { create: section.stimuli.map((stimulus, position) => ({ ...stimulus, position })) },
        },
        include: { stimuli: { orderBy: { position: 'asc' }, select: { id: true } } },
      });
      for (const [g, group] of (sections[s] ?? []).entries()) {
        await tx.questionGroup.create({
          data: {
            sectionId: created.id,
            position: g,
            type: group.type,
            instructions: group.instructions,
            config: group.config,
            stimulusId: group.stimulusIndex === undefined ? null : created.stimuli[group.stimulusIndex]?.id,
            questions: { create: group.questions.map((question, position) => ({ ...question, position })) },
          },
        });
      }
    }
  }

  /** A full-length test must look like one, or its band estimate would be meaningless. */
  private checkFullLength(version: VersionTree): void {
    const questions = flattenQuestions(version);
    const skills = new Set(version.sections.map((s) => s.skill));
    const [skill] = skills;
    const problem =
      skills.size !== 1 || (skill !== 'LISTENING' && skill !== 'READING')
        ? 'A full-length test must be Listening only or Reading only'
        : questions.length !== FULL_TEST_QUESTIONS || questions.some((q) => q.question.points !== 1 || q.manual)
          ? `A full-length test needs exactly ${FULL_TEST_QUESTIONS} one-point auto-scored questions`
          : skill === 'READING' && !version.module
            ? 'A full-length Reading test must say whether it is Academic or General'
            : null;
    if (problem) throw new BadRequestException(problem);
  }

  /** Moves a version between states only if it is still in the expected one. */
  private async transition(
    user: Principal,
    versionId: string,
    from: ContentStatus,
    to: ContentStatus,
    action: string,
    extra: Prisma.TaskSetVersionUpdateManyMutationInput = {},
  ): Promise<void> {
    const { count } = await this.prisma.taskSetVersion.updateMany({
      where: { id: versionId, status: from },
      data: { status: to, ...extra },
    });
    if (count === 0) throw new ConflictException(`This version is not ${from.toLowerCase().replace('_', ' ')}`);
    await this.record(user, action, versionId, { from, to });
  }

  private record(user: Principal, action: string, versionId: string, data: Record<string, string | number>) {
    return this.audit.record({
      action,
      actorId: user.userId,
      centerId: user.centerId,
      entityType: 'TaskSetVersion',
      entityId: versionId,
      data,
    });
  }
}

/** Converts a stored version back into the authoring document, for cloning. */
function toInput(tree: VersionTree): VersionContentInput {
  return {
    difficulty: tree.difficulty ?? undefined,
    timeLimitSec: tree.timeLimitSec ?? undefined,
    fullLength: tree.fullLength,
    module: tree.module ?? undefined,
    tags: tree.tags,
    sections: tree.sections.map((section) => ({
      skill: section.skill,
      kind: section.kind,
      title: section.title ?? undefined,
      instructions: section.instructions ?? undefined,
      stimuli: section.stimuli.map((s) => ({
        kind: s.kind,
        title: s.title ?? undefined,
        text: s.text ?? undefined,
        fileKey: s.fileKey ?? undefined,
        transcript: s.transcript ?? undefined,
      })),
      groups: section.groups.map((group) => {
        const stimulusIndex = section.stimuli.findIndex((s) => s.id === group.stimulusId);
        return {
          type: group.type,
          instructions: group.instructions ?? undefined,
          config: group.config,
          stimulusIndex: stimulusIndex === -1 ? undefined : stimulusIndex,
          questions: group.questions.map((q) => ({
            number: q.number,
            prompt: q.prompt,
            answerKey: q.answerKey ?? undefined,
            explanation: q.explanation ?? undefined,
            points: q.points,
          })),
        };
      }),
    })),
  };
}
