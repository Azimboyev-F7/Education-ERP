import type { z } from 'zod';
import {
  ChangePasswordRequest,
  CreateBranchRequest,
  CreateCourseRequest,
  CreateLevelRequest,
  CreatePeriodRequest,
  CreateStaffRequest,
  CreateStudentRequest,
  EnrolRequest,
  GroupTeacherRequest,
  SetRolesRequest,
  TransferRequest,
  UpdateGroupRequest,
  UpdateStaffRequest,
  UpdateStudentRequest,
} from './accounts.js';
import { AssignmentQuery, CreateAssignmentRequest } from './assignments.js';
import { PracticeQuery, SaveResponsesRequest, StartAttemptRequest } from './attempts.js';
import { LoginRequest, Me } from './auth.js';
import { CreateTaskSetRequest, TaskSetQuery, VersionContentInput } from './content.js';
import { CreateGroupRequest } from './org.js';
import { ReviewQuery, ScoreReviewRequest } from './reviews.js';
import {
  AssignmentCreated,
  AssignmentDetail,
  AssignmentList,
  AssignmentReport,
  AttemptStarted,
  AttemptView,
  AutosaveResult,
  BranchList,
  CourseList,
  Credentials,
  GroupAnalytics,
  GroupDetail,
  GroupList,
  HealthResponse,
  IdResponse,
  MyAssignmentList,
  MyAttemptList,
  NewVersionCreated,
  PasswordReset,
  PeriodList,
  PracticeCatalog,
  ReviewDetail,
  ReviewQueue,
  ReviewScored,
  StaffList,
  StudentAnalytics,
  StudentDetail,
  StudentList,
  TaskSetCreated,
  TaskSetList,
  VersionDetail,
} from './responses/index.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * One API operation. This list is the contract: the OpenAPI document is generated from it, the
 * integration tests validate every response against it, and a test fails if a route exists in the
 * server that is not described here (or the other way round).
 */
export interface Endpoint {
  /** Unique, stable name; becomes the OpenAPI `operationId` (and a method name in generated clients). */
  id: string;
  method: HttpMethod;
  /** Express-style path relative to the API root, e.g. `/groups/:id`. */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** Who may call it, in words. The server enforces this; the text is documentation. */
  who: string;
  /** No session needed. */
  public?: true;
  body?: z.ZodType;
  query?: z.ZodType;
  /** Success body. Leave out for a response with no content. */
  response?: z.ZodType;
  /** Success status. 204 when there is no response body, otherwise 200 unless stated. */
  status?: number;
  /** Error statuses beyond the ones implied by the shape of the request (see `errorStatuses`). */
  errors?: readonly number[];
  /** Sensitive result that must not be cached (one-time passwords). */
  noStore?: true;
}

const ADMIN = 'Administrators';
const MANAGER = 'Administrators, and academic managers of the branch concerned';
const STAFF = 'Any staff member, limited to the groups and students in their scope';
const STUDENT = 'Students (the signed-in student’s own data)';
const APPROVER = 'Administrators and academic managers';

const CONFLICT = 409;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;

export const ENDPOINTS: readonly Endpoint[] = [
  // ───────────── health ─────────────
  { id: 'getHealth', method: 'get', path: '/health', tag: 'Health', summary: 'Liveness and database check', who: 'Anyone', public: true, response: HealthResponse },

  // ───────────── auth ─────────────
  {
    id: 'login', method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Sign in',
    description: 'Sets an httpOnly session cookie. Repeated failures for the same username and address are throttled.',
    who: 'Anyone', public: true, body: LoginRequest, errors: [401, 429],
  },
  { id: 'logout', method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Sign out', who: 'Any signed-in user' },
  {
    id: 'changePassword', method: 'post', path: '/auth/password', tag: 'Auth', summary: 'Change your own password',
    description: 'Ends every other session of the account. A wrong current password is a 400, not a 401, so clients do not treat the session as lost. Allowed while a temporary password is still in force.',
    who: 'Any signed-in user', body: ChangePasswordRequest, errors: [429],
  },
  {
    id: 'getMe', method: 'get', path: '/auth/me', tag: 'Auth', summary: 'The signed-in user',
    description: 'Allowed while a temporary password is still in force; check `mustChangePassword`.',
    who: 'Any signed-in user', response: Me,
  },

  // ───────────── centre structure ─────────────
  { id: 'listBranches', method: 'get', path: '/branches', tag: 'Centre', summary: 'Branches in scope', who: STAFF, response: BranchList },
  { id: 'listCourses', method: 'get', path: '/courses', tag: 'Centre', summary: 'Courses with their levels', who: STAFF, response: CourseList },
  { id: 'listPeriods', method: 'get', path: '/periods', tag: 'Centre', summary: 'Academic periods', who: STAFF, response: PeriodList },
  { id: 'createBranch', method: 'post', path: '/branches', tag: 'Centre', summary: 'Create a branch', who: ADMIN, body: CreateBranchRequest, response: IdResponse, status: 201, errors: [CONFLICT] },
  { id: 'createCourse', method: 'post', path: '/courses', tag: 'Centre', summary: 'Create a course', who: ADMIN, body: CreateCourseRequest, response: IdResponse, status: 201, errors: [CONFLICT] },
  { id: 'createLevel', method: 'post', path: '/courses/:id/levels', tag: 'Centre', summary: 'Add a level to a course', description: 'Levels are appended after the existing ones.', who: ADMIN, body: CreateLevelRequest, response: IdResponse, status: 201, errors: [CONFLICT] },
  { id: 'createPeriod', method: 'post', path: '/periods', tag: 'Centre', summary: 'Create an academic period', who: ADMIN, body: CreatePeriodRequest, response: IdResponse, status: 201, errors: [CONFLICT] },

  // ───────────── groups ─────────────
  { id: 'listGroups', method: 'get', path: '/groups', tag: 'Groups', summary: 'Active groups in scope', who: STAFF, response: GroupList },
  { id: 'getGroup', method: 'get', path: '/groups/:id', tag: 'Groups', summary: 'A group with its teachers and current roster', who: STAFF, response: GroupDetail },
  { id: 'createGroup', method: 'post', path: '/groups', tag: 'Groups', summary: 'Create a group', who: MANAGER, body: CreateGroupRequest, response: IdResponse, status: 201, errors: [NOT_FOUND] },
  { id: 'updateGroup', method: 'patch', path: '/groups/:id', tag: 'Groups', summary: 'Rename a group or change its level or period', who: MANAGER, body: UpdateGroupRequest, errors: [CONFLICT] },
  { id: 'archiveGroup', method: 'post', path: '/groups/:id/archive', tag: 'Groups', summary: 'Archive a group', description: 'Releases its students; their history is kept.', who: MANAGER, errors: [CONFLICT] },
  { id: 'addGroupTeacher', method: 'put', path: '/groups/:id/teachers', tag: 'Groups', summary: 'Assign a teacher to a group', who: MANAGER, body: GroupTeacherRequest, errors: [CONFLICT] },
  { id: 'removeGroupTeacher', method: 'delete', path: '/groups/:id/teachers/:userId', tag: 'Groups', summary: 'Remove a teacher from a group', who: MANAGER, errors: [CONFLICT] },
  { id: 'enrolStudent', method: 'post', path: '/groups/:id/students', tag: 'Groups', summary: 'Enrol a student in a group', who: MANAGER, body: EnrolRequest, errors: [CONFLICT] },
  { id: 'unenrolStudent', method: 'post', path: '/groups/:id/students/:studentId/remove', tag: 'Groups', summary: 'Remove a student from a group', description: 'Ends the enrolment; the student’s results are kept.', who: MANAGER, errors: [CONFLICT] },

  // ───────────── students ─────────────
  { id: 'listStudents', method: 'get', path: '/students', tag: 'Students', summary: 'Students enrolled in groups in scope', who: STAFF, response: StudentList },
  {
    id: 'createStudent', method: 'post', path: '/students', tag: 'Students', summary: 'Create a student account',
    description: 'Returns a one-time temporary password; the student must change it before doing anything else. Academic managers must name a group in their branch.',
    who: MANAGER, body: CreateStudentRequest, response: Credentials, status: 201, errors: [NOT_FOUND, CONFLICT], noStore: true,
  },
  { id: 'getStudent', method: 'get', path: '/students/:id', tag: 'Students', summary: 'A student’s profile and current groups', who: STAFF, response: StudentDetail },
  {
    id: 'updateStudent', method: 'patch', path: '/students/:id', tag: 'Students', summary: 'Update a student',
    description: 'Teachers and managers who can see the student may set the target band, exam date and module. Changing the name needs management rights.',
    who: STAFF, body: UpdateStudentRequest,
  },
  { id: 'transferStudent', method: 'post', path: '/students/:id/transfer', tag: 'Students', summary: 'Move a student between groups', who: MANAGER, body: TransferRequest, errors: [CONFLICT] },

  // ───────────── staff ─────────────
  { id: 'listStaff', method: 'get', path: '/staff', tag: 'Staff', summary: 'Staff accounts', who: APPROVER, response: StaffList },
  {
    id: 'createStaff', method: 'post', path: '/staff', tag: 'Staff', summary: 'Create a staff account',
    description: 'Returns a one-time temporary password; the new user must change it before doing anything else.',
    who: ADMIN, body: CreateStaffRequest, response: Credentials, status: 201, errors: [NOT_FOUND, CONFLICT], noStore: true,
  },
  { id: 'updateStaff', method: 'patch', path: '/staff/:id', tag: 'Staff', summary: 'Rename a staff member', who: ADMIN, body: UpdateStaffRequest },
  {
    id: 'setStaffRoles', method: 'put', path: '/staff/:id/roles', tag: 'Staff', summary: 'Replace a staff member’s roles',
    description: 'The centre can never be left without an active administrator.',
    who: ADMIN, body: SetRolesRequest, errors: [CONFLICT],
  },

  // ───────────── account lifecycle ─────────────
  { id: 'disableUser', method: 'post', path: '/users/:id/disable', tag: 'Accounts', summary: 'Disable an account', description: 'Signs the person out everywhere and blocks sign-in; records are kept. Staff accounts: administrators. Students: administrators and branch managers.', who: MANAGER, errors: [BAD_REQUEST, CONFLICT] },
  { id: 'enableUser', method: 'post', path: '/users/:id/enable', tag: 'Accounts', summary: 'Re-enable an account', who: MANAGER, errors: [BAD_REQUEST] },
  {
    id: 'resetPassword', method: 'post', path: '/users/:id/reset-password', tag: 'Accounts', summary: 'Issue a new temporary password',
    description: 'Signs the person out everywhere. You cannot reset your own password here.',
    who: MANAGER, response: PasswordReset, errors: [BAD_REQUEST], noStore: true,
  },

  // ───────────── content ─────────────
  { id: 'listTaskSets', method: 'get', path: '/task-sets', tag: 'Content', summary: 'Task sets with their latest and published versions', who: 'Any staff member', query: TaskSetQuery, response: TaskSetList },
  { id: 'createTaskSet', method: 'post', path: '/task-sets', tag: 'Content', summary: 'Create a task set with an empty first draft', who: 'Any staff member', body: CreateTaskSetRequest, response: TaskSetCreated, status: 201 },
  { id: 'createTaskSetVersion', method: 'post', path: '/task-sets/:id/versions', tag: 'Content', summary: 'Start a new draft as a copy of the latest version', who: 'Any staff member', response: NewVersionCreated, status: 201, errors: [CONFLICT] },
  { id: 'getTaskSetVersion', method: 'get', path: '/task-set-versions/:id', tag: 'Content', summary: 'A version with its full content, including answer keys', who: 'Any staff member', response: VersionDetail },
  {
    id: 'saveTaskSetVersionContent', method: 'put', path: '/task-set-versions/:id/content', tag: 'Content', summary: 'Replace the whole content of a draft',
    description: 'Atomic: either all of it is stored or none. Question content is validated against the question-type registry.',
    who: 'The draft’s author, or an administrator or academic manager', body: VersionContentInput, response: VersionDetail, errors: [CONFLICT],
  },
  { id: 'submitTaskSetVersion', method: 'post', path: '/task-set-versions/:id/submit', tag: 'Content', summary: 'Submit a draft for review', who: 'The draft’s author, or an administrator or academic manager', errors: [BAD_REQUEST, CONFLICT] },
  { id: 'returnTaskSetVersion', method: 'post', path: '/task-set-versions/:id/return', tag: 'Content', summary: 'Send a version in review back to draft', who: APPROVER, errors: [CONFLICT] },
  { id: 'publishTaskSetVersion', method: 'post', path: '/task-set-versions/:id/publish', tag: 'Content', summary: 'Publish a version in review', description: 'Retires the previously published version of the same task set.', who: APPROVER, errors: [BAD_REQUEST, CONFLICT] },
  { id: 'retireTaskSetVersion', method: 'post', path: '/task-set-versions/:id/retire', tag: 'Content', summary: 'Retire a published version', description: 'It can no longer be assigned or practised; existing results are untouched.', who: APPROVER, errors: [CONFLICT] },

  // ───────────── assignments ─────────────
  { id: 'listAssignments', method: 'get', path: '/assignments', tag: 'Assignments', summary: 'Assignments in scope', who: STAFF, query: AssignmentQuery, response: AssignmentList },
  { id: 'createAssignment', method: 'post', path: '/assignments', tag: 'Assignments', summary: 'Assign a published task set to a group and/or students', who: STAFF, body: CreateAssignmentRequest, response: AssignmentCreated, status: 201, errors: [NOT_FOUND, CONFLICT] },
  { id: 'getAssignment', method: 'get', path: '/assignments/:id', tag: 'Assignments', summary: 'An assignment with its recipients', who: STAFF, response: AssignmentDetail },
  { id: 'getAssignmentReport', method: 'get', path: '/assignments/:id/report', tag: 'Assignments', summary: 'Results of an assignment, question by question', who: STAFF, response: AssignmentReport },
  { id: 'excuseRecipient', method: 'post', path: '/assignments/:id/recipients/:studentId/excuse', tag: 'Assignments', summary: 'Excuse a student from an assignment', description: 'Removes the obligation without deleting any work already done.', who: STAFF, errors: [CONFLICT] },
  { id: 'cancelAssignment', method: 'post', path: '/assignments/:id/cancel', tag: 'Assignments', summary: 'Cancel an assignment', who: STAFF },
  { id: 'listMyAssignments', method: 'get', path: '/my/assignments', tag: 'Student', summary: 'My assignments', who: STUDENT, response: MyAssignmentList },

  // ───────────── attempts ─────────────
  {
    id: 'startAttempt', method: 'post', path: '/attempts', tag: 'Attempts', summary: 'Start (or resume) an attempt',
    description: 'Idempotent: an attempt already in progress is returned as is. Send `recipientId` for assigned work or `versionId` for self-chosen practice.',
    who: STUDENT, body: StartAttemptRequest, response: AttemptStarted, status: 201, errors: [NOT_FOUND, CONFLICT],
  },
  {
    id: 'getAttempt', method: 'get', path: '/attempts/:id', tag: 'Attempts', summary: 'An attempt with its content and saved answers',
    description: 'Answer keys, explanations, marks and the band estimate appear only once the attempt has been handed in. The first read after the deadline closes the attempt.',
    who: 'The student, or staff who can see that student', response: AttemptView,
  },
  { id: 'saveResponses', method: 'put', path: '/attempts/:id/responses', tag: 'Attempts', summary: 'Autosave answers', who: STUDENT, body: SaveResponsesRequest, response: AutosaveResult, errors: [CONFLICT] },
  { id: 'submitAttempt', method: 'post', path: '/attempts/:id/submit', tag: 'Attempts', summary: 'Hand in an attempt', description: 'Idempotent: submitting twice scores once and returns the same result.', who: STUDENT, response: AttemptView, status: 200 },
  { id: 'listMyAttempts', method: 'get', path: '/my/attempts', tag: 'Student', summary: 'My most recent attempts', who: STUDENT, response: MyAttemptList },
  { id: 'listPracticeTaskSets', method: 'get', path: '/practice/task-sets', tag: 'Student', summary: 'Published task sets I may practise on my own', who: STUDENT, query: PracticeQuery, response: PracticeCatalog },

  // ───────────── reviews ─────────────
  { id: 'listReviews', method: 'get', path: '/reviews', tag: 'Reviews', summary: 'Writing and Speaking responses waiting for (or given) feedback', who: STAFF, query: ReviewQuery, response: ReviewQueue },
  { id: 'getReview', method: 'get', path: '/reviews/:id', tag: 'Reviews', summary: 'One response to mark, with its rubric', who: STAFF, response: ReviewDetail },
  {
    id: 'scoreReview', method: 'post', path: '/reviews/:id/score', tag: 'Reviews', summary: 'Record the rubric scores for a response',
    description: 'Exactly one band per rubric criterion. When it is the last open review of an attempt, the attempt and its assignment become completed.',
    who: STAFF, body: ScoreReviewRequest, response: ReviewScored, status: 201, errors: [CONFLICT],
  },

  // ───────────── analytics ─────────────
  { id: 'getStudentAnalytics', method: 'get', path: '/analytics/students/:id', tag: 'Analytics', summary: 'One student: performance by skill and task type, completion and band estimates', who: STAFF, response: StudentAnalytics },
  { id: 'getGroupAnalytics', method: 'get', path: '/analytics/groups/:id', tag: 'Analytics', summary: 'One group: who is keeping up and what the group finds hard', who: STAFF, response: GroupAnalytics },
  { id: 'getMyProgress', method: 'get', path: '/my/progress', tag: 'Student', summary: 'My own progress', who: STUDENT, response: StudentAnalytics },
];

export const successStatus = (e: Endpoint): number => e.status ?? (e.response ? 200 : 204);

/**
 * Every error status an endpoint may answer with: the ones implied by its shape (a body or query can
 * be invalid, a signed-in route can refuse the session or the role, an id in the path can be
 * unknown) plus the extra ones it names.
 */
export function errorStatuses(e: Endpoint): number[] {
  const statuses = new Set<number>(e.errors ?? []);
  if (e.body || e.query) statuses.add(400);
  if (!e.public) {
    statuses.add(401);
    statuses.add(403);
  }
  if (e.path.includes(':')) statuses.add(404);
  return [...statuses].sort((a, b) => a - b);
}

/** `/groups/:id` → `/groups/{id}` */
export const openApiPath = (path: string): string => path.replace(/:([A-Za-z]+)/g, '{$1}');

export const pathParams = (path: string): string[] => [...path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]!);
