import type { ReviewDetail } from "@erp/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, formatBand, formatDate, humanise, PageHeader, SKILL_LABEL, Surface } from "@/components/ui";
import { apiGet, NotFoundError } from "@/lib/api";
import { ScoreForm } from "./score-form";

export const metadata: Metadata = { title: "Review" };
export const instant = false;

export default async function ReviewPage({ params }: PageProps<"/reviews/[id]">) {
  const { id } = await params;
  let review: ReviewDetail;
  try {
    review = await apiGet<ReviewDetail>(`/reviews/${id}`);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const prompt = textOf(review.prompt);
  const answer = textOf(review.answer);
  const words = answer ? answer.trim().split(/\s+/).length : 0;

  return (
    <>
      <PageHeader
        back={{ href: "/reviews", label: "Reviews" }}
        title={`${SKILL_LABEL[review.skill]} · ${humanise(review.taskType)}`}
        description={`Handed in ${formatDate(review.createdAt)}`}
        actions={review.status === "DONE" ? <Badge tone="ok">Marked</Badge> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {prompt && (
            <section aria-labelledby="prompt">
              <h2 id="prompt" className="mb-2 text-[15px] font-semibold">
                Task
              </h2>
              <Surface className="p-5">
                <p className="max-w-[70ch] whitespace-pre-wrap text-ink-2">{prompt}</p>
              </Surface>
            </section>
          )}

          <section aria-labelledby="answer">
            <h2 id="answer" className="mb-2 flex items-baseline justify-between text-[15px] font-semibold">
              Student’s response
              {answer && <span className="text-[13px] font-normal text-ink-3">{words} words</span>}
            </h2>
            <Surface className="p-5">
              {answer ? (
                <p className="max-w-[70ch] whitespace-pre-wrap text-[15px] leading-7 text-ink">{answer}</p>
              ) : review.answer ? (
                <p className="text-ink-3">This response is not text. Open the recording from the student’s attempt.</p>
              ) : (
                <p className="text-ink-3">No response was saved.</p>
              )}
            </Surface>
          </section>
        </div>

        <aside aria-labelledby="scoring" className="lg:sticky lg:top-6 lg:self-start">
          <h2 id="scoring" className="mb-2 text-[15px] font-semibold">
            {review.status === "DONE" ? "Result" : "Score"}
          </h2>
          {review.rubric ? (
            <ScoreForm
              id={review.id}
              rubricName={review.rubric.name}
              criteria={review.rubric.criteria}
              result={review.result}
            />
          ) : (
            <Surface className="p-5 text-ink-3">This review uses a rubric that is no longer available.</Surface>
          )}
          {review.result && review.result.overallBand !== null && (
            <p className="mt-3 text-[13px] text-ink-3">Overall band {formatBand(review.result.overallBand)}</p>
          )}
        </aside>
      </div>
    </>
  );
}

/** Responses are stored as JSON; Writing answers carry their text in `text`. */
function textOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const { text } = value as { text?: unknown };
    if (typeof text === "string") return text;
  }
  return null;
}
