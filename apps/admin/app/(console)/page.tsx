import type { AssignmentListItem, GroupSummary, ReviewQueueItem } from "@erp/contracts";
import Link from "next/link";
import { Badge, Empty, formatDay, humanise, PageHeader, Row, RowLink, Section, SKILL_LABEL, Table, Td, Th, waiting } from "@/components/ui";
import { apiGet, getCurrentUser } from "@/lib/api";

export const instant = false;

export default async function OverviewPage() {
  const [user, reviews, assignments, groups] = await Promise.all([
    getCurrentUser(),
    apiGet<ReviewQueueItem[]>("/reviews?status=PENDING"),
    apiGet<AssignmentListItem[]>("/assignments"),
    apiGet<GroupSummary[]>("/groups"),
  ]);

  const open = assignments
    .filter((a) => a.counts.total - a.counts.completed - a.counts.excused > 0)
    .sort((a, b) => b.counts.overdue - a.counts.overdue || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"))
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.fullName.split(" ")[0]}`}
        description={
          reviews.length > 0
            ? `${reviews.length} ${reviews.length === 1 ? "response is" : "responses are"} waiting for your feedback.`
            : "Nothing is waiting for your feedback."
        }
      />

      <Section
        title="Waiting for feedback"
        action={reviews.length > 5 ? <ViewAll href="/reviews">View all {reviews.length}</ViewAll> : undefined}
      >
        {reviews.length === 0 ? (
          <Empty title="You’re all caught up">New Writing and Speaking responses will appear here as students hand them in.</Empty>
        ) : (
          <Table label="Responses waiting for feedback">
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Task</Th>
                <Th align="right">Waiting</Th>
              </tr>
            </thead>
            <tbody>
              {reviews.slice(0, 5).map((r) => (
                <Row key={r.id}>
                  <Td>
                    <RowLink href={`/reviews/${r.id}`}>{r.student.fullName}</RowLink>
                  </Td>
                  <Td>
                    {SKILL_LABEL[r.skill]} · {humanise(r.taskType)}
                  </Td>
                  <Td align="right">
                    <Badge tone={r.waitingHours >= 48 ? "warn" : "neutral"}>{waiting(r.waitingHours)}</Badge>
                  </Td>
                </Row>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Open assignments" action={assignments.length > 0 ? <ViewAll href="/assignments">View all</ViewAll> : undefined}>
        {open.length === 0 ? (
          <Empty title="No open assignments">Assign a published task set to a group from the library.</Empty>
        ) : (
          <Table label="Open assignments">
            <thead>
              <tr>
                <Th>Assignment</Th>
                <Th>Group</Th>
                <Th>Due</Th>
                <Th align="right">Handed in</Th>
              </tr>
            </thead>
            <tbody>
              {open.map((a) => (
                <Row key={a.id}>
                  <Td strong>{a.title}</Td>
                  <Td>{a.group?.name ?? "Individual"}</Td>
                  <Td>
                    {formatDay(a.dueAt)} {a.counts.overdue > 0 && <Badge tone="bad">{a.counts.overdue} overdue</Badge>}
                  </Td>
                  <Td align="right">
                    {a.counts.completed + a.counts.awaitingReview} of {a.counts.total - a.counts.excused}
                  </Td>
                </Row>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Your groups" note={groups.length} action={groups.length > 0 ? <ViewAll href="/groups">View all</ViewAll> : undefined}>
        {groups.length === 0 ? (
          <Empty title="No groups yet">Groups you teach or manage will appear here.</Empty>
        ) : (
          <Table label="Your groups">
            <thead>
              <tr>
                <Th>Group</Th>
                <Th>Branch</Th>
                <Th align="right">Students</Th>
              </tr>
            </thead>
            <tbody>
              {groups.slice(0, 6).map((g) => (
                <Row key={g.id}>
                  <Td>
                    <RowLink href={`/groups/${g.id}`}>{g.name}</RowLink>
                  </Td>
                  <Td>{g.branchName}</Td>
                  <Td align="right">{g.studentCount}</Td>
                </Row>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}

function ViewAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-medium text-accent hover:text-accent-hover">
      {children}
    </Link>
  );
}
