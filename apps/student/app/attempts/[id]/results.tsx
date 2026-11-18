import type { AttemptView } from "@erp/contracts";
import Link from "next/link";
import { BackIcon } from "@/components/icons";
import { Badge, Facts, formatBand, formatDate, SKILL_LABEL, Surface } from "@/components/ui";
import { describe, questionText } from "@/lib/questions";

/** The handed-in attempt: marks, answers against the key, and teacher feedback once it exists. */
export function Results({ attempt }: { attempt: AttemptView }) {
  const marking = attempt.status === "AWAITING_REVIEW";
  const responses = new Map(attempt.responses.map((r) => [r.questionId, r]));

  return (
    <main className="mx-auto max-w-[760px] px-4 py-8 pb-16 md:px-8 md:py-10">
      <Link href="/progress" className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 transition-colors duration-100 hover:text-ink">
        <BackIcon />
        Progress
      </Link>
      <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-ink">{attempt.content.title}</h1>
      <p className="mt-1 text-ink-3">{marking ? "Handed in. Your teacher is marking the written parts." : "Handed in and marked."}</p>

      <div className="mt-8">
        <Facts
          items={[
            { label: "Score", value: attempt.score != null && attempt.maxScore ? `${attempt.score} of ${attempt.maxScore}` : "—" },
            { label: "Band estimate", value: formatBand(attempt.bandEstimate) },
            { label: "Handed in", value: formatDate(attempt.submittedAt) },
            { label: "Source", value: attempt.source === "ASSIGNMENT" ? "Assigned" : "Practice" },
          ]}
        />
        {attempt.bandEstimate != null && <p className="mt-3 text-sm text-ink-3">A practice estimate only. It is not an official IELTS result.</p>}
      </div>

      {attempt.content.sections.map((section) => (
        <section key={section.id} className="mt-12" aria-labelledby={`s-${section.id}`}>
          <h2 id={`s-${section.id}`} className="mb-4 text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink">
            {section.title ?? SKILL_LABEL[section.skill]}
          </h2>
          <Surface>
            <ol className="divide-y divide-line">
              {section.groups.flatMap((group) =>
                group.questions.map((q) => {
                  const r = responses.get(q.id);
                  const given = describe(group.type, group.config, q.prompt, r?.answer);
                  const key = q.answerKey == null ? null : describe(group.type, group.config, q.prompt, q.answerKey);
                  const pending = r?.review?.status === "PENDING";
                  return (
                    <li key={q.id} className="space-y-2 px-4 py-4 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-ink">
                          <span className="mr-2 font-semibold text-ink-3">{q.number}</span>
                          {questionText(group.type, q.prompt)}
                        </p>
                        {pending ? (
                          <Badge tone="warn">Marking</Badge>
                        ) : r?.isCorrect === true ? (
                          <Badge tone="ok">Correct</Badge>
                        ) : r?.isCorrect === false ? (
                          <Badge tone="bad">Incorrect</Badge>
                        ) : given === null && !r?.review ? (
                          <Badge>Not answered</Badge>
                        ) : r?.review?.overallBand != null ? (
                          <Badge tone="accent">Band {formatBand(r.review.overallBand)}</Badge>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-line text-ink-2">
                        <span className="text-ink-3">Your answer: </span>
                        {given ?? <span className="text-ink-3">No answer</span>}
                      </p>
                      {r?.isCorrect !== true && !pending && key && (
                        <p className="text-ink-2">
                          <span className="text-ink-3">Correct answer: </span>
                          {key}
                        </p>
                      )}
                      {q.explanation && <p className="text-sm text-ink-3">{q.explanation}</p>}
                      {r?.review?.comment && (
                        <div className="rounded-lg bg-canvas p-3">
                          <p className="text-ink-2">{r.review.comment}</p>
                          {r.review.nextStep && <p className="mt-2 font-medium text-ink">Next step: {r.review.nextStep}</p>}
                        </div>
                      )}
                    </li>
                  );
                }),
              )}
            </ol>
          </Surface>
        </section>
      ))}
    </main>
  );
}
