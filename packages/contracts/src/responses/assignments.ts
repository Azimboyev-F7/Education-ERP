import { z } from 'zod';
import { AssignmentKind, RecipientStatus } from '../assignments.js';
import { AttemptStatus } from '../attempts.js';
import { Skill } from '../content.js';
import { IdRef, IsoDateTime, named, PersonRef } from './common.js';

export const AssignmentCreated = named('AssignmentCreated', z.object({ id: z.string(), recipients: z.number().int() }));

/** Recipients by state. `overdue` overlaps the others: it counts open work past its due date. */
export const StatusCounts = named(
  'StatusCounts',
  z.object({
    total: z.number().int(),
    assigned: z.number().int(),
    started: z.number().int(),
    awaitingReview: z.number().int(),
    completed: z.number().int(),
    excused: z.number().int(),
    overdue: z.number().int(),
  }),
);

export const AssignmentListItem = named(
  'AssignmentListItem',
  z.object({
    id: z.string(),
    title: z.string(),
    kind: AssignmentKind,
    group: IdRef.nullable(),
    taskSet: z.object({ versionId: z.string(), title: z.string(), skill: Skill.nullable() }),
    opensAt: IsoDateTime.nullable(),
    dueAt: IsoDateTime.nullable(),
    counts: StatusCounts,
  }),
);
export type AssignmentListItem = z.infer<typeof AssignmentListItem>;
export const AssignmentList = z.array(AssignmentListItem);

const coreShape = {
  id: z.string(),
  title: z.string(),
  kind: AssignmentKind,
  instructions: z.string().nullable(),
  opensAt: IsoDateTime.nullable(),
  dueAt: IsoDateTime.nullable(),
  timeLimitSec: z.number().int().nullable(),
  maxAttempts: z.number().int(),
  cancelledAt: IsoDateTime.nullable(),
  versionId: z.string(),
  group: IdRef.nullable(),
};

/** The assignment itself, without its recipients. */
export const AssignmentCore = named('AssignmentCore', z.object(coreShape));

export const AssignmentDetail = named(
  'AssignmentDetail',
  z.object({
    ...coreShape,
    counts: StatusCounts,
    recipients: z.array(
      z.object({
        id: z.string(),
        student: PersonRef,
        status: RecipientStatus,
        overdue: z.boolean(),
        completedAt: IsoDateTime.nullable(),
        latestAttempt: z
          .object({
            id: z.string(),
            status: AttemptStatus,
            score: z.number().nullable(),
            maxScore: z.number().nullable(),
            bandEstimate: z.number().nullable(),
            submittedAt: IsoDateTime.nullable(),
          })
          .nullable(),
      }),
    ),
  }),
);
export type AssignmentDetail = z.infer<typeof AssignmentDetail>;

export const MyAssignment = named(
  'MyAssignment',
  z.object({
    recipientId: z.string(),
    assignmentId: z.string(),
    title: z.string(),
    kind: AssignmentKind,
    instructions: z.string().nullable(),
    skill: Skill.nullable(),
    opensAt: IsoDateTime.nullable(),
    dueAt: IsoDateTime.nullable(),
    timeLimitSec: z.number().int().nullable(),
    status: RecipientStatus,
    overdue: z.boolean(),
    attemptsUsed: z.number().int(),
    attemptsAllowed: z.number().int(),
  }),
);
export type MyAssignment = z.infer<typeof MyAssignment>;
export const MyAssignmentList = z.array(MyAssignment);
