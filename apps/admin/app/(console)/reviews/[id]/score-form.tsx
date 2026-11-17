"use client";

import type { ReviewDetail } from "@erp/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const BANDS = Array.from({ length: 19 }, (_, i) => (18 - i) / 2); // 9.0 down to 0.0

const control =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink transition-colors duration-100 hover:border-ink-3 focus-visible:border-accent";

export function ScoreForm(props: {
  id: string;
  rubricName: string;
  criteria: { key: string; label: string }[];
  result: ReviewDetail["result"];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const done = props.result !== null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const criteria = Object.fromEntries(props.criteria.map((c) => [c.key, Number(form.get(c.key))]));
    const comment = String(form.get("comment") ?? "").trim();
    const nextStep = String(form.get("nextStep") ?? "").trim();

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/${props.id}/score`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ criteria, ...(comment ? { comment } : {}), ...(nextStep ? { nextStep } : {}) }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      setError(
        response.status === 409
          ? "Someone has already marked this response. Reload to see their result."
          : response.status === 400
            ? "Choose a band for every criterion."
            : "Could not save the score. Try again.",
      );
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-raised">
      <p className="text-xs font-medium text-ink-3">{props.rubricName}</p>

      {props.criteria.map((c) => (
        <label key={c.key} className="block font-medium text-ink">
          {c.label}
          {done ? (
            <output className="mt-1 block text-[15px]">{props.result?.criteria?.[c.key]?.toFixed(1) ?? "—"}</output>
          ) : (
            <select name={c.key} required defaultValue="" className={control}>
              <option value="" disabled>
                Choose a band…
              </option>
              {BANDS.map((b) => (
                <option key={b} value={b}>
                  {b.toFixed(1)}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}

      {done ? (
        <>
          {props.result?.comment && <Readonly label="Comment" text={props.result.comment} />}
          {props.result?.nextStep && <Readonly label="Next step for the student" text={props.result.nextStep} />}
        </>
      ) : (
        <>
          <label className="block font-medium text-ink">
            Comment
            <textarea name="comment" rows={4} maxLength={5000} autoComplete="off" placeholder="What worked and what to fix…" className={control} />
          </label>
          <label className="block font-medium text-ink">
            Next step for the student
            <input name="nextStep" maxLength={1000} autoComplete="off" placeholder="e.g. Plan paragraphs before writing…" className={control} />
          </label>
          <div aria-live="polite">
            {error && (
              <p role="alert" className="text-bad">
                {error}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent px-3 py-2.5 font-medium text-white transition-colors duration-100 hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save Score"}
          </button>
        </>
      )}
    </form>
  );
}

function Readonly({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="font-medium text-ink">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-ink-2">{text}</p>
    </div>
  );
}
