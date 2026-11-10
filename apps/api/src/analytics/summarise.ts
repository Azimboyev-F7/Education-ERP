export interface EvidenceRow {
  skill: string;
  taskType: string;
  kind: string;
  score: number;
  maxScore: number;
  band: number | null;
  occurredAt: Date;
}

interface Window {
  /** Pieces of evidence in the window. A trend needs several; the UI should say so when it is low. */
  count: number;
  /** Accuracy 0–1 for auto-scored evidence, mean band for teacher-assessed evidence. */
  value: number | null;
}

export interface SkillSummary {
  skill: string;
  taskType: string;
  /** AUTO_SCORED, TEACHER_ASSESSED or OFFICIAL_RESULT — never merged into one number. */
  kind: string;
  measure: 'accuracy' | 'band';
  all: Window;
  /** The last 30 days. */
  recent: Window;
  /** The 30 days before that, for comparison. */
  previous: Window;
  lastAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_DAYS = 30;

function measure(rows: EvidenceRow[], useBand: boolean): Window {
  if (rows.length === 0) return { count: 0, value: null };
  if (useBand) {
    const bands = rows.flatMap((r) => (r.band === null ? [] : [r.band]));
    return { count: rows.length, value: bands.length ? round(bands.reduce((a, b) => a + b, 0) / bands.length) : null };
  }
  const max = rows.reduce((sum, r) => sum + r.maxScore, 0);
  return { count: rows.length, value: max > 0 ? round(rows.reduce((sum, r) => sum + r.score, 0) / max) : null };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Groups evidence by skill, task type and kind, with a recent-versus-previous comparison. */
export function summarise(rows: EvidenceRow[], now = new Date()): SkillSummary[] {
  const groups = new Map<string, EvidenceRow[]>();
  for (const row of rows) {
    const key = `${row.skill}|${row.taskType}|${row.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const recentFrom = now.getTime() - WINDOW_DAYS * DAY_MS;
  const previousFrom = recentFrom - WINDOW_DAYS * DAY_MS;

  return [...groups.values()]
    .map((group) => {
      const first = group[0]!;
      const useBand = first.kind !== 'AUTO_SCORED';
      const time = (r: EvidenceRow) => r.occurredAt.getTime();
      return {
        skill: first.skill,
        taskType: first.taskType,
        kind: first.kind,
        measure: useBand ? ('band' as const) : ('accuracy' as const),
        all: measure(group, useBand),
        recent: measure(group.filter((r) => time(r) >= recentFrom), useBand),
        previous: measure(group.filter((r) => time(r) >= previousFrom && time(r) < recentFrom), useBand),
        lastAt: new Date(Math.max(...group.map(time))),
      };
    })
    .sort((a, b) => a.skill.localeCompare(b.skill) || a.taskType.localeCompare(b.taskType) || a.kind.localeCompare(b.kind));
}
