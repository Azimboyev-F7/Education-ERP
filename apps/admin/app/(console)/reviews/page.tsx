import type { ReviewQueueItem } from "@erp/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, formatBand, humanise, PageHeader, Row, RowLink, SKILL_LABEL, Table, Td, Th, waiting } from "@/components/ui";
import { apiGet } from "@/lib/api";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  const { status } = await searchParams;
  const done = status === "DONE";
  const reviews = await apiGet<ReviewQueueItem[]>(`/reviews?status=${done ? "DONE" : "PENDING"}`);

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Writing and Speaking responses to mark against the IELTS rubric."
        actions={
          <nav aria-label="Review status" className="flex gap-1 rounded-lg bg-surface p-1 shadow-raised ring-1 ring-line">
            <Tab href="/reviews" current={!done}>
              Waiting
            </Tab>
            <Tab href="/reviews?status=DONE" current={done}>
              Done
            </Tab>
          </nav>
        }
      />
      {reviews.length === 0 ? (
        <Empty title={done ? "No finished reviews yet" : "You’re all caught up"}>
          {done ? "Responses you have marked will be listed here." : "New responses will appear here as students hand them in."}
        </Empty>
      ) : (
        <Table label={done ? "Finished reviews" : "Responses waiting for feedback"}>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Task</Th>
              <Th align="right">{done ? "Band" : "Waiting"}</Th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <Row key={r.id}>
                <Td>
                  <RowLink href={`/reviews/${r.id}`}>{r.student.fullName}</RowLink>
                </Td>
                <Td>
                  {SKILL_LABEL[r.skill]} · {humanise(r.taskType)}
                </Td>
                <Td align="right">
                  {done ? formatBand(r.overallBand) : <Badge tone={r.waitingHours >= 48 ? "warn" : "neutral"}>{waiting(r.waitingHours)}</Badge>}
                </Td>
              </Row>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

function Tab({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-100 ${current ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-canvas"}`}
    >
      {children}
    </Link>
  );
}
