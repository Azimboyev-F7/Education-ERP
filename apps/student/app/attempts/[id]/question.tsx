"use client";

import { asOptions, asRecord, TFNG_LABEL, wordCount } from "@/lib/questions";

const control =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink transition-colors duration-100 hover:border-ink-3 focus-visible:border-accent";

type Props = {
  type: string;
  config: unknown;
  prompt: unknown;
  answer: unknown;
  onChange: (answer: Record<string, unknown>) => void;
  labelledBy: string;
};

/** One question's answer control. Types come from the scoring registry; unknown ones say so rather than breaking. */
export function QuestionInput({ type, config, prompt, answer, onChange, labelledBy }: Props) {
  const p = asRecord(prompt);
  const a = asRecord(answer);

  switch (type) {
    case "MULTIPLE_CHOICE": {
      const selected = Array.isArray(a.selected) ? (a.selected as string[]) : [];
      return (
        <div role="group" aria-labelledby={labelledBy} className="space-y-2">
          {asOptions(p.options).map((o) => {
            const on = selected.includes(o.id);
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-100 ${
                  on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-ink-3"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onChange({ selected: on ? selected.filter((id) => id !== o.id) : [...selected, o.id] })}
                  className="mt-1 size-4 accent-[#0a57d0]"
                />
                <span>
                  <span className="mr-2 font-semibold text-ink-3">{o.id}</span>
                  {o.text}
                </span>
              </label>
            );
          })}
        </div>
      );
    }
    case "TRUE_FALSE_NOT_GIVEN":
      return (
        <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
          {(Object.keys(TFNG_LABEL) as (keyof typeof TFNG_LABEL)[]).map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-lg border px-4 py-2 font-medium transition-colors duration-100 ${
                a.value === value ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2 hover:border-ink-3"
              }`}
            >
              <input type="radio" name={labelledBy} checked={a.value === value} onChange={() => onChange({ value })} className="sr-only" />
              {TFNG_LABEL[value]}
            </label>
          ))}
        </div>
      );
    case "MATCHING_HEADINGS":
      return (
        <select
          aria-labelledby={labelledBy}
          value={typeof a.headingId === "string" ? a.headingId : ""}
          onChange={(e) => e.target.value && onChange({ headingId: e.target.value })}
          className={control}
        >
          <option value="">Choose a heading…</option>
          {asOptions(asRecord(config).headings).map((h) => (
            <option key={h.id} value={h.id}>
              {h.id}. {h.text}
            </option>
          ))}
        </select>
      );
    case "SENTENCE_COMPLETION":
    case "SUMMARY_COMPLETION":
    case "SHORT_ANSWER": {
      const max = asRecord(config).maxWords;
      return (
        <div>
          <input
            aria-labelledby={labelledBy}
            value={typeof a.text === "string" ? a.text : ""}
            onChange={(e) => onChange({ text: e.target.value })}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            className={control}
          />
          {typeof max === "number" && <p className="mt-1 text-xs text-ink-3">No more than {max} {max === 1 ? "word" : "words"}.</p>}
        </div>
      );
    }
    case "ESSAY": {
      const text = typeof a.text === "string" ? a.text : "";
      const min = asRecord(config).minWords;
      const count = wordCount(text);
      return (
        <div>
          <textarea
            aria-labelledby={labelledBy}
            value={text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={16}
            maxLength={30000}
            className={`${control} resize-y leading-6`}
          />
          <p className="mt-1 text-xs text-ink-3">
            {count} {count === 1 ? "word" : "words"}
            {typeof min === "number" && (count >= min ? ` · minimum ${min} reached` : ` · aim for at least ${min}`)}
          </p>
        </div>
      );
    }
    case "SPEAKING_PROMPT":
      return (
        <div className="space-y-3">
          <label className="flex items-center gap-3 font-medium text-ink">
            <input
              type="checkbox"
              checked={a.completed === true}
              onChange={(e) => onChange(e.target.checked ? { ...a, completed: true } : {})}
              className="size-4 accent-[#0a57d0]"
            />
            I have done this speaking task
          </label>
          {a.completed === true && (
            <textarea
              aria-label="Notes for your teacher"
              value={typeof a.notes === "string" ? a.notes : ""}
              onChange={(e) => onChange({ completed: true, notes: e.target.value })}
              rows={4}
              maxLength={4000}
              className={control}
              placeholder="Notes for your teacher (optional)"
            />
          )}
        </div>
      );
    default:
      return <p className="text-ink-3">This question type isn’t supported in the app yet. Ask your teacher.</p>;
  }
}
