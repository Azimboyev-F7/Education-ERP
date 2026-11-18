import type { GroupSummary } from "@erp/contracts";
import type { Metadata } from "next";
import { Empty, PageHeader, Row, RowLink, Table, Td, Th } from "@/components/ui";
import { apiGet } from "@/lib/api";

export const metadata: Metadata = { title: "Groups" };
export const instant = false;

export default async function GroupsPage() {
  const groups = await apiGet<GroupSummary[]>("/groups");

  return (
    <>
      <PageHeader title="Groups" description={`${groups.length} active ${groups.length === 1 ? "group" : "groups"} in your scope.`} />
      {groups.length === 0 ? (
        <Empty title="No groups yet">Groups you teach or manage will appear here.</Empty>
      ) : (
        <Table label="Groups">
          <thead>
            <tr>
              <Th>Group</Th>
              <Th>Branch</Th>
              <Th>Course</Th>
              <Th>Level</Th>
              <Th align="right">Students</Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Row key={g.id}>
                <Td>
                  <RowLink href={`/groups/${g.id}`}>{g.name}</RowLink>
                </Td>
                <Td>{g.branchName}</Td>
                <Td>{g.courseName}</Td>
                <Td>{g.levelName ?? "—"}</Td>
                <Td align="right">{g.studentCount}</Td>
              </Row>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
