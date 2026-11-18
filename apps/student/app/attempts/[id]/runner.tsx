"use client";

import type { AttemptView } from "@erp/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackIcon } from "@/components/icons";
import { SKILL_LABEL } from "@/components/ui";
import { isAnswered, questionText } from "@/lib/questions";
import { QuestionInput } from "./question";

type SaveState = "saved" | "saving" | "error";

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, "0")}`;
};

export function Runner({ attempt }: { attempt: AttemptView }) {
  const router = useRouter();

  const questions = useMemo(
    () => attempt.content.sections.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => ({ ...q, type: g.type })))),
    [attempt],
  );
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => Object.fromEntries(attempt.responses.map((r) => [r.questionId, r.answer])));
  const [save, setSave] = useState<SaveState>("saved");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mutable state the timers read, so effects don't re-subscribe on every keystroke.
  const answersRef = useRef(answers);
  const dirty = useRef(new Set<string>());
  const saving = useRef(false);
  const submitted = useRef(false);

  const flush = useCallback(async (): Promise<boolean> => {
    if (saving.current) return false;
    const ids = [...dirty.current];
    const sent = Object.fromEntries(ids.map((id) => [id, answersRef.current[id]]));
    if (ids.length === 0) return true;
    saving.current = true;
    setSave("saving");
    try {
      const response = await fetch(`/api/attempts/${attempt.id}/responses`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ responses: ids.map((questionId) => ({ questionId, answer: sent[questionId] })) }),
      });
      if (!response.ok) throw new Error(String(response.status));
      for (const id of ids) {
        // Only forget answers that haven't changed again while the request was in flight.
        if (answersRef.current[id] === sent[id]) dirty.current.delete(id);
      }
      setSave(dirty.current.size === 0 ? "saved" : "saving");
      return dirty.current.size === 0;
    } catch {
      setSave("error");
      return false;
    } finally {
      saving.current = false;
    }
  }, [attempt.id]);

  // Save shortly after typing stops, and retry while anything is still unsaved.
  useEffect(() => {
    const timer = setInterval(() => {
      if (dirty.current.size > 0) void flush();
    }, 1500);
    return () => clearInterval(timer);
  }, [flush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current.size > 0) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    setError(null);
    for (let i = 0; i < 3 && dirty.current.size > 0; i++) {
      await flush();
      if (dirty.current.size > 0) await new Promise((r) => setTimeout(r, 500));
    }
    try {
      const response = await fetch(`/api/attempts/${attempt.id}/submit`, { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      dirty.current.clear();
      router.refresh();
    } catch {
      submitted.current = false;
      setSubmitting(false);
      setError("Could not hand in. Your answers are saved here; check your connection and try again.");
    }
  }, [attempt.id, flush, router]);

  // Count down against the server's clock, not the device's.
  const deadline = attempt.deadlineAt ? Date.parse(attempt.deadlineAt) : null;
  const [remaining, setRemaining] = useState<number | null>(deadline === null ? null : deadline - Date.parse(attempt.serverNow));
  useEffect(() => {
    if (deadline === null) return;
    const offset = Date.parse(attempt.serverNow) - Date.now();
    const tick = () => {
      const left = deadline - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0) void submit();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline, attempt.serverNow, submit]);

  function change(questionId: string, answer: Record<string, unknown>) {
    answersRef.current = { ...answersRef.current, [questionId]: answer };
    dirty.current.add(questionId);
    setAnswers(answersRef.current);
    setSave("saving");
  }

  const answered = questions.filter((q) => isAnswered(q.type, answers[q.id])).length;
  const unanswered = questions.length - answered;

  return (
    <div className="min-h-screen pb-32">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex min-h-14 max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 md:px-8">
          <Link href="/" className="flex items-center gap-1 text-[13px] text-ink-3 transition-colors duration-100 hover:text-ink">
            <BackIcon />
            Leave
          </Link>
          <h1 className="min-w-0 flex-1 truncate font-semibold text-ink">{attempt.content.title}</h1>
          <span aria-live="polite" className={`text-sm ${save === "error" ? "text-bad" : "text-ink-3"}`}>
            {save === "saved" ? "Saved" : save === "saving" ? "Saving…" : "Not saved. Retrying…"}
          </span>
          {remaining !== null && (
            <span role="timer" className={`font-semibold tabular-nums ${remaining < 300_000 ? "text-bad" : "text-ink"}`}>
              {clock(remaining)}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] space-y-12 px-4 py-8 md:px-8">
        {attempt.content.sections.map((section) => {
          const withStimuli = section.stimuli.length > 0;
          return (
            <section key={section.id} aria-labelledby={`s-${section.id}`}>
              <h2 id={`s-${section.id}`} className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink">
                {section.title ?? SKILL_LABEL[section.skill]}
              </h2>
              {section.instructions && <p className="mt-1 max-w-[65ch] text-ink-2">{section.instructions}</p>}

              <div className={`mt-6 gap-8 ${withStimuli ? "grid lg:grid-cols-2 lg:items-start" : ""}`}>
                {withStimuli && (
                  <div className="space-y-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:rounded-xl lg:border lg:border-line lg:bg-surface lg:p-6">
                    {section.stimuli.map((s) => (
                      <article key={s.id}>
                        {s.title && <h3 className="mb-2 font-semibold text-ink">{s.title}</h3>}
                        {s.kind === "AUDIO" ? (
                          <p className="rounded-lg bg-canvas p-3 text-ink-3">Audio isn’t available in the app yet. Ask your teacher how to listen.</p>
                        ) : (
                          s.text && <p className="max-w-[65ch] whitespace-pre-line text-ink-2">{s.text}</p>
                        )}
                      </article>
                    ))}
                  </div>
                )}

                <div className="space-y-8">
                  {section.groups.map((group) => (
                    <div key={group.id} className="space-y-5">
                      {group.instructions && <p className="font-medium text-ink">{group.instructions}</p>}
                      {group.questions.map((q) => (
                        <div key={q.id}>
                          <p id={`q-${q.id}`} className="mb-2 text-ink">
                            <span className="mr-2 font-semibold text-ink-3">{q.number}</span>
                            {questionText(group.type, q.prompt)}
                          </p>
                          <QuestionInput
                            type={group.type}
                            config={group.config}
                            prompt={q.prompt}
                            answer={answers[q.id]}
                            onChange={(a) => change(q.id, a)}
                            labelledBy={`q-${q.id}`}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          {confirming ? (
            <>
              <p role="alert" className="text-ink">
                {unanswered > 0 ? `${unanswered} ${unanswered === 1 ? "question is" : "questions are"} unanswered. ` : ""}
                You can’t change your answers after handing in.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  className="rounded-lg bg-canvas px-4 py-2 font-medium text-ink transition-colors duration-100 hover:bg-line disabled:opacity-60"
                >
                  Keep Working
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="rounded-lg bg-accent px-4 py-2 font-medium text-white transition-colors duration-100 hover:bg-accent-hover disabled:opacity-60"
                >
                  {submitting ? "Handing in…" : "Hand In Now"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-ink-3">
                {answered} of {questions.length} answered
              </p>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-lg bg-accent px-4 py-2 font-medium text-white transition-colors duration-100 hover:bg-accent-hover"
              >
                Hand In
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="w-full text-bad">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
