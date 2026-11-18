import { z } from 'zod';
import { BranchSummary, GroupSummary, StudentSummary } from '../org.js';
import { IdRef, IsoDateTime, named, PersonRef } from './common.js';

export const BranchList = z.array(BranchSummary);
export const GroupList = z.array(GroupSummary);
export const StudentList = z.array(StudentSummary);

export const CourseSummary = named(
  'CourseSummary',
  z.object({
    id: z.string(),
    name: z.string(),
    levels: z.array(z.object({ id: z.string(), name: z.string(), position: z.number().int() })),
  }),
);
export type CourseSummary = z.infer<typeof CourseSummary>;
export const CourseList = z.array(CourseSummary);

export const PeriodSummary = named(
  'PeriodSummary',
  z.object({ id: z.string(), name: z.string(), startsOn: IsoDateTime, endsOn: IsoDateTime }),
);
export type PeriodSummary = z.infer<typeof PeriodSummary>;
export const PeriodList = z.array(PeriodSummary);

export const GroupDetail = named(
  'GroupDetail',
  z.object({
    id: z.string(),
    name: z.string(),
    archivedAt: IsoDateTime.nullable(),
    branch: IdRef,
    course: IdRef,
    level: IdRef.nullable(),
    period: IdRef.nullable(),
    /** Whether the caller may restructure this group (rename, enrol, assign teachers). */
    canManage: z.boolean(),
    teachers: z.array(PersonRef),
    students: z.array(
      z.object({
        id: z.string(),
        fullName: z.string(),
        username: z.string(),
        active: z.boolean(),
        targetBand: z.number().nullable(),
        enrolledOn: IsoDateTime,
      }),
    ),
  }),
);
export type GroupDetail = z.infer<typeof GroupDetail>;
