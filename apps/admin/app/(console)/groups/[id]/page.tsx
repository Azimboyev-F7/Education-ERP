import type { GroupAnalytics, GroupDetail } from "@erp/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Empty, Facts, formatBand, formatDate, formatPercent, PageHeader, Row, RowLink, Section, SKILL_LABEL, Table, Td, Th } from "@/components/ui";
import { apiGet, NotFoundError } from "@/lib/api";
import { humanise } from "@/components/ui";

export const metadata: Metadata = { title: "Group" };
export const instant = false;

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  let group: GroupDetail, analytics: GroupAnalytics;
  try {
    [group, analytics] = await Promise.all([apiGet<GroupDetail>(`/groups/${id}`), apiGet<GroupAnalytics>(`/analytics/groups/${id}`)]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const byStudent = new Map(analytics.students.map((s) => [s.id, s]));
  const hardest = analytics.skills
    .filter((s) => s.measure === "accuracy" && s.all.value !== null && s.all.count >= 5)
    .sort((a, b) => (a.all.value ?? 1) - (b.all.value ?? 1))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        back={{ href: "/groups", label: "Groups" }}
        title={group.name}
        description={group.archivedAt ? `Archived on ${formatDate(group.archivedAt)}` : undefined}
      />

      <div className="mb-10">
        <Facts
          items={[
            { label: "Branch", value: group.branch.name },
            { label: "Course", value: group.course.name },
            { label: "Level", value: group.level?.name ?? "—" },
            { label: "Teachers", value: group.teachers.map((t) => t.fullName).join(", ") || "None assigned" },
          ]}
        />
      </div>

      <Section title="Students" note={group.students.length}>
        {group.students.length === 0 ? (
          <Empty title="No students enrolled">Enrolled students will appear here with their progress.</Empty>
        ) : (
          <Table label="Students in this group">
            <thead>
              <tr>
                <Th>Student</Th>
                <Th align="right">Target band</Th>
                <Th align="right">Accuracy</Th>
                <Th align="right">Open work</Th>
              </tr>
            </thead>
            <tbody>
              {group.students.map((s) => {
                const stats = byStudent.get(s.id);
                return (
                  <Row key={s.id}>
                    <Td>
                      <RowLink href={`/students/${s.id}`}>{s.fullName}</RowLink>
                      {!s.active && (
                        <span className="ml-2">
                          <Badge>Disabled</Badge>
                        </span>
                      )}
                    </Td>
                    <Td align="right">{formatBand(s.targetBand)}</Td>
                    <Td align="right">{stats ? formatPercent(stats.accuracy) : "—"}</Td>
                    <Td align="right">
                      {stats ? stats.completion.open : 0}
                      {stats && stats.completion.overdue > 0 && (
                        <span className="ml-2">
                          <Badge tone="bad">{stats.completion.overdue} overdue</Badge>
                        </span>
                      )}
                    </Td>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Where the group struggles" note="auto-scored work, lowest accuracy first">
        {hardest.length === 0 ? (
          <Empty title="Not enough results yet">Task types appear here once at least five questions have been answered.</Empty>
        ) : (
          <Table label="Lowest-accuracy task types">
            <thead>
              <tr>
                <Th>Skill</Th>
                <Th>Task type</Th>
                <Th align="right">Answers</Th>
                <Th align="right">Accuracy</Th>
              </tr>
            </thead>
            <tbody>
              {hardest.map((s) => (
                <Row key={`${s.skill}${s.taskType}`}>
                  <Td strong>{SKILL_LABEL[s.skill]}</Td>
                  <Td>{humanise(s.taskType)}</Td>
                  <Td align="right">{s.all.count}</Td>
                  <Td align="right">{formatPercent(s.all.value)}</Td>
                </Row>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
