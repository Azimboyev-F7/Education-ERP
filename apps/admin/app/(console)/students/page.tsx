import type { StudentSummary } from "@erp/contracts";
import type { Metadata } from "next";
import { Empty, formatBand, PageHeader, Row, RowLink, Table, Td, Th } from "@/components/ui";
import { apiGet } from "@/lib/api";

export const metadata: Metadata = { title: "Students" };
export const instant = false;

export default async function StudentsPage() {
  const students = await apiGet<StudentSummary[]>("/students");

  return (
    <>
      <PageHeader
        title="Students"
        description={`${students.length} ${students.length === 1 ? "student" : "students"} enrolled in your groups.`}
      />
      {students.length === 0 ? (
        <Empty title="No students yet">Students appear here once they are enrolled in a group you teach or manage.</Empty>
      ) : (
        <Table label="Students">
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Username</Th>
              <Th>Groups</Th>
              <Th align="right">Target band</Th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <Row key={s.id}>
                <Td>
                  <RowLink href={`/students/${s.id}`}>{s.fullName}</RowLink>
                </Td>
                <Td>{s.username}</Td>
                <Td className="max-w-[16rem] truncate">{s.groups.map((g) => g.name).join(", ")}</Td>
                <Td align="right">{formatBand(s.targetBand)}</Td>
              </Row>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
