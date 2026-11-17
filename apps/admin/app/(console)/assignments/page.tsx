import type { AssignmentListItem } from "@erp/contracts";
import type { Metadata } from "next";
import { Badge, Empty, formatDay, PageHeader, Row, Table, Td, Th } from "@/components/ui";
import { apiGet } from "@/lib/api";

export const metadata: Metadata = { title: "Assignments" };
export const instant = false;

const KIND = { CLASSWORK: "Classwork", HOMEWORK: "Homework", LEVEL_CHECK: "Level check", EXAM: "Exam" } as const;

export default async function AssignmentsPage() {
  const assignments = await apiGet<AssignmentListItem[]>("/assignments");

  return (
    <>
      <PageHeader title="Assignments" description="Work set for your groups and students, newest first." />
      {assignments.length === 0 ? (
        <Empty title="No assignments yet">Assign a published task set to a group to see progress here.</Empty>
      ) : (
        <Table label="Assignments">
          <thead>
            <tr>
              <Th>Assignment</Th>
              <Th>Type</Th>
              <Th>Group</Th>
              <Th>Due</Th>
              <Th align="right">Handed in</Th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => {
              const expected = a.counts.total - a.counts.excused;
              const done = a.counts.completed + a.counts.awaitingReview;
              return (
                <Row key={a.id}>
                  <Td strong>
                    {a.title}
                    <span className="block text-xs font-normal text-ink-3">{a.taskSet.title}</span>
                  </Td>
                  <Td>{KIND[a.kind]}</Td>
                  <Td>{a.group?.name ?? "Individual"}</Td>
                  <Td>
                    {formatDay(a.dueAt)} {a.counts.overdue > 0 && <Badge tone="bad">{a.counts.overdue} overdue</Badge>}
                  </Td>
                  <Td align="right">
                    {done} of {expected}
                  </Td>
                </Row>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
