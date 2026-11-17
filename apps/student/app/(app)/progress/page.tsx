import type { MyAttempt, StudentAnalytics } from "@erp/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, Facts, formatBand, formatDate, formatDay, formatPercent, humanise, Item, List, PageHeader, Section, SKILL_LABEL } from "@/components/ui";
import { apiGet } from "@/lib/api";

export const metadata: Metadata = { title: "Progress" };
export const instant = false;

export default async function ProgressPage() {
  const [progress, attempts] = await Promise.all([apiGet<StudentAnalytics>("/my/progress"), apiGet<MyAttempt[]>("/my/attempts")]);
  const { student, completion, skills, bandEstimates } = progress;

  return (
    <>
      <PageHeader title="Progress" description="How you’re doing on each skill. Band figures from practice are estimates, not official IELTS results." />

      <Section title="At a glance">
        <Facts
          items={[
            { label: "Target band", value: formatBand(student.targetBand) },
            { label: "Exam date", value: formatDate(student.examDate) },
            { label: "Tasks finished", value: `${completion.completed} of ${completion.assigned}` },
            { label: "Overdue", value: completion.overdue },
          ]}
        />
      </Section>

      <Section title="By task type">
        {skills.length === 0 ? (
          <Empty title="No results yet">Finish a task and your strengths and weak spots show up here.</Empty>
        ) : (
          <List label="Performance by task type">
            {skills.map((s) => {
              const fmt = (v: number | null) => (s.measure === "band" ? formatBand(v) : formatPercent(v));
              const delta = s.recent.value != null && s.previous.value != null ? s.recent.value - s.previous.value : null;
              return (
                <Item
                  key={`${s.skill}-${s.taskType}`}
                  title={humanise(s.taskType)}
                  meta={`${SKILL_LABEL[s.skill]} · ${s.all.count} ${s.all.count === 1 ? "answer" : "answers"}${s.kind === "TEACHER_ASSESSED" ? " · Teacher marked" : ""}`}
                  trailing={
                    <div className="flex items-center gap-3">
                      {delta != null && Math.abs(delta) >= (s.measure === "band" ? 0.25 : 0.05) && (
                        <Badge tone={delta > 0 ? "ok" : "warn"}>{delta > 0 ? "Improving" : "Slipping"}</Badge>
                      )}
                      <span className="w-14 text-right font-semibold text-ink">{fmt(s.recent.value ?? s.all.value)}</span>
                    </div>
                  }
                />
              );
            })}
          </List>
        )}
      </Section>

      {bandEstimates.length > 0 && (
        <Section title="Band estimates">
          <List label="Band estimates">
            {bandEstimates.map((b) => (
              <Item
                key={b.attemptId}
                title={<Link href={`/attempts/${b.attemptId}`} className="hover:text-accent">{b.title}</Link>}
                meta={`${formatDay(b.submittedAt)}${b.skill ? ` · ${SKILL_LABEL[b.skill]}` : ""} · Practice estimate`}
                trailing={<span className="font-semibold text-ink">{formatBand(b.band)}</span>}
              />
            ))}
          </List>
        </Section>
      )}

      <Section title="History">
        {attempts.length === 0 ? (
          <Empty title="Nothing handed in yet" />
        ) : (
          <List label="Recent attempts">
            {attempts.map((a) => (
              <Item
                key={a.id}
                title={<Link href={`/attempts/${a.id}`} className="hover:text-accent">{a.title}</Link>}
                meta={`${formatDay(a.submittedAt ?? a.startedAt)}${a.skill ? ` · ${SKILL_LABEL[a.skill]}` : ""} · ${a.source === "ASSIGNMENT" ? "Assigned" : "Practice"}`}
                trailing={
                  a.status === "IN_PROGRESS" ? (
                    <Badge>In progress</Badge>
                  ) : a.status === "AWAITING_REVIEW" ? (
                    <Badge tone="warn">Marking</Badge>
                  ) : a.score != null && a.maxScore ? (
                    <span className="font-medium text-ink">{a.score}/{a.maxScore}</span>
                  ) : null
                }
              />
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
