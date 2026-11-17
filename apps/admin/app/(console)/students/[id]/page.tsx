import type { StudentAnalytics } from "@erp/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Badge,
  Empty,
  Facts,
  formatBand,
  formatDate,
  formatPercent,
  humanise,
  PageHeader,
  Row,
  Section,
  SKILL_LABEL,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { apiGet, NotFoundError } from "@/lib/api";

export const metadata: Metadata = { title: "Student" };

export default async function StudentPage({ params }: PageProps<"/students/[id]">) {
  const { id } = await params;
  let data: StudentAnalytics;
  try {
    data = await apiGet<StudentAnalytics>(`/analytics/students/${id}`);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { student, completion, skills, bandEstimates } = data;

  return (
    <>
      <PageHeader back={{ href: "/students", label: "Students" }} title={student.fullName} />

      <div className="mb-10">
        <Facts
          items={[
            { label: "Target band", value: formatBand(student.targetBand) },
            { label: "Exam date", value: formatDate(student.examDate) },
            { label: "Work handed in", value: `${completion.completed + completion.awaitingReview} of ${completion.assigned}` },
            { label: "Overdue", value: completion.overdue },
          ]}
        />
      </div>

      <Section title="Performance by task type" note="auto-scored accuracy and teacher bands are kept apart">
        {skills.length === 0 ? (
          <Empty title="No results yet">Results appear here after this student hands in work.</Empty>
        ) : (
          <Table label="Performance by skill and task type">
            <thead>
              <tr>
                <Th>Skill</Th>
                <Th>Task type</Th>
                <Th>Measure</Th>
                <Th align="right">Overall</Th>
                <Th align="right">Last 30 days</Th>
                <Th align="right">Before that</Th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => {
                const show = (v: number | null) => (s.measure === "band" ? formatBand(v) : formatPercent(v));
                return (
                  <Row key={`${s.skill}${s.taskType}${s.kind}`}>
                    <Td strong>{SKILL_LABEL[s.skill]}</Td>
                    <Td>{humanise(s.taskType)}</Td>
                    <Td>
                      <Badge tone={s.measure === "band" ? "accent" : "neutral"}>{s.measure === "band" ? "Teacher band" : "Accuracy"}</Badge>
                    </Td>
                    <Td align="right">{show(s.all.value)}</Td>
                    <Td align="right">{s.recent.count > 0 ? show(s.recent.value) : "—"}</Td>
                    <Td align="right">{s.previous.count > 0 ? show(s.previous.value) : "—"}</Td>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Band estimates" note="practice estimates from full-length timed tests, not official results">
        {bandEstimates.length === 0 ? (
          <Empty title="No estimates yet">Estimates appear after a timed full-length Listening or Reading test.</Empty>
        ) : (
          <Table label="Band estimates">
            <thead>
              <tr>
                <Th>Test</Th>
                <Th>Skill</Th>
                <Th>Date</Th>
                <Th align="right">Estimated band</Th>
              </tr>
            </thead>
            <tbody>
              {bandEstimates.map((b) => (
                <Row key={b.attemptId}>
                  <Td strong>{b.title}</Td>
                  <Td>{b.skill ? SKILL_LABEL[b.skill] : "—"}</Td>
                  <Td>{formatDate(b.submittedAt)}</Td>
                  <Td align="right">{formatBand(b.band)}</Td>
                </Row>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
