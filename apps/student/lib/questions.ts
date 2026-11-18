/** The question types the API serves, and how a student's answer to each is shaped. See @erp/scoring. */
export type Prompt = Record<string, unknown>;

export type Answer = Record<string, unknown>;

export const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

export type Option = { id: string; text: string };
export const asOptions = (value: unknown): Option[] => (Array.isArray(value) ? (value as Option[]) : []);

export const TFNG_LABEL = { TRUE: "True", FALSE: "False", NOT_GIVEN: "Not given" } as const;

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Whether an answer counts as given, for "N unanswered" and the progress count. */
export function isAnswered(type: string, answer: unknown): boolean {
  const a = asRecord(answer);
  switch (type) {
    case "MULTIPLE_CHOICE":
      return Array.isArray(a.selected) && a.selected.length > 0;
    case "TRUE_FALSE_NOT_GIVEN":
      return typeof a.value === "string";
    case "MATCHING_HEADINGS":
      return typeof a.headingId === "string";
    case "SPEAKING_PROMPT":
      return a.completed === true;
    default:
      return typeof a.text === "string" && a.text.trim().length > 0;
  }
}

/** A readable form of an answer or an answer key, for the results screen. */
export function describe(type: string, config: unknown, prompt: unknown, value: unknown): string | null {
  const v = asRecord(value);
  switch (type) {
    case "MULTIPLE_CHOICE": {
      const ids = (Array.isArray(v.selected) ? v.selected : Array.isArray(v.correct) ? v.correct : []) as string[];
      const options = asOptions(asRecord(prompt).options);
      return ids.length ? ids.map((id) => options.find((o) => o.id === id)?.text ?? id).join("; ") : null;
    }
    case "TRUE_FALSE_NOT_GIVEN":
      return typeof v.value === "string" ? (TFNG_LABEL[v.value as keyof typeof TFNG_LABEL] ?? v.value) : null;
    case "MATCHING_HEADINGS": {
      const id = typeof v.headingId === "string" ? v.headingId : null;
      return id ? (asOptions(asRecord(config).headings).find((h) => h.id === id)?.text ?? id) : null;
    }
    case "SPEAKING_PROMPT":
      return v.completed === true ? "Marked as done" : null;
    default:
      if (Array.isArray(v.accepted)) return (v.accepted as string[]).join(" / ");
      return typeof v.text === "string" && v.text.trim() ? v.text : null;
  }
}

/** The question's visible wording, by type. */
export function questionText(type: string, prompt: unknown): string {
  const p = asRecord(prompt);
  const value = p.stem ?? p.statement ?? p.paragraph ?? p.text;
  return typeof value === "string" ? value : "";
}
