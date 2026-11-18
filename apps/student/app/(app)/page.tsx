import type { MyAssignment, MyAttempt } from "@erp/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, formatDay, formatMinutes, Item, List, PageHeader, Section, SKILL_LABEL } from "@/components/ui";
import { StartButton } from "@/components/start-button";
import { apiGet } from "@/lib/api";

const isFuture = (iso: string) => new Date(iso).getTime() > Date.now();

export const metadata: Metadata = { title: "Today" };
export const instant = false;

const KIND_LABEL = { CLASSWORK: "Classwork", HOMEWORK: "Homework", LEVEL_CHECK: "Level check", EXAM: "Exam" } as const;

export default async function TodayPage() {
  const [assignments, attempts] = await Promise.all([apiGet<MyAssignment[]>("/my/assignments"), apiGet<MyAttempt[]>("/my/attempts")]);

  const todo = assignments
    .filter((a) => a.status === "ASSIGNED" || a.status === "STARTED")
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"));
  const waiting = assignments.filter((a) => a.status === "AWAITING_REVIEW");
  const recent = attempts.filter((a) => a.status !== "IN_PROGRESS").slice(0, 4);
  const resume = attempts.filter((a) => a.status === "IN_PROGRESS" && a.source === "SELF_PRACTICE");

  return (
    <>
      <PageHeader
        title="Today"
        description={todo.length === 0 ? "You’re all caught up." : `${todo.length} ${todo.length === 1 ? "task" : "tasks"} from your teacher.`}
      />

      <Section title="To do">
        {todo.length === 0 ? (
          <Empty title="Nothing due">
            Your teacher’s homework appears here. Meanwhile, <Link href="/practice" className="font-medium text-accent hover:underline">practise on your own</Link>.
          </Empty>
        ) : (
          <List label="Tasks to do">
            {todo.map((a) => {
              const notOpen = a.opensAt !== null && isFuture(a.opensAt);
              return (
                <Item
                  key={a.recipientId}
                  title={a.title}
                  meta={
                    <>
                      {KIND_LABEL[a.kind]}
                      {a.skill && ` · ${SKILL_LABEL[a.skill]}`}
                      {formatMinutes(a.timeLimitSec) && ` · ${formatMinutes(a.timeLimitSec)}`}
                      {a.dueAt && ` · Due ${formatDay(a.dueAt)}`}
                      {a.overdue && <span className="ml-2 align-middle"><Badge tone="bad">Overdue</Badge></span>}
                    </>
                  }
                  trailing={
                    notOpen ? (
                      <span className="text-sm text-ink-3">Opens {formatDay(a.opensAt)}</span>
                    ) : (
                      <StartButton body={{ recipientId: a.recipientId }} label={a.status === "STARTED" ? "Continue" : "Start"} />
                    )
                  }
                />
              );
            })}
          </List>
        )}
      </Section>

      {resume.length > 0 && (
        <Section title="Unfinished practice">
          <List label="Unfinished practice">
            {resume.map((a) => (
              <Item
                key={a.id}
                title={a.title}
                meta={`Started ${formatDay(a.startedAt)}`}
                trailing={
                  <Link href={`/attempts/${a.id}`} className="rounded-lg bg-canvas px-4 py-2 font-medium text-ink transition-colors duration-100 hover:bg-line">
                    Continue
                  </Link>
                }
              />
            ))}
          </List>
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title="Waiting for your teacher" note={waiting.length}>
          <List label="Waiting for feedback">
            {waiting.map((a) => (
              <Item key={a.recipientId} title={a.title} meta="Handed in. Feedback will appear in Progress." trailing={<Badge tone="warn">Marking</Badge>} />
            ))}
          </List>
        </Section>
      )}

      {recent.length > 0 && (
        <Section
          title="Recently finished"
          action={
            <Link href="/progress" className="text-sm font-medium text-accent hover:underline">
              See all progress
            </Link>
          }
        >
          <List label="Recently finished">
            {recent.map((a) => (
              <Item
                key={a.id}
                title={<Link href={`/attempts/${a.id}`} className="hover:text-accent">{a.title}</Link>}
                meta={`${a.submittedAt ? formatDay(a.submittedAt) : ""}${a.skill ? ` · ${SKILL_LABEL[a.skill]}` : ""}`}
                trailing={
                  a.status === "AWAITING_REVIEW" ? (
                    <Badge tone="warn">Marking</Badge>
                  ) : a.score != null && a.maxScore ? (
                    <span className="font-medium text-ink">{a.score}/{a.maxScore}</span>
                  ) : null
                }
              />
            ))}
          </List>
        </Section>
      )}
    </>
  );
}
