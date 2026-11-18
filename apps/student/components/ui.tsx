import Link from "next/link";
import type { ReactNode } from "react";
import { BackIcon } from "./icons";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export function PageHeader(props: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {props.back && (
          <Link href={props.back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-3 transition-colors duration-100 hover:text-ink">
            <BackIcon />
            {props.back.label}
          </Link>
        )}
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-ink">{props.title}</h1>
        {props.description && <p className="mt-1 max-w-[65ch] text-ink-3">{props.description}</p>}
      </div>
      {props.actions}
    </header>
  );
}

export function Section(props: { title: string; note?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] leading-5 font-semibold text-ink">
          {props.title}
          {props.note !== undefined && <span className="ml-2 font-normal text-ink-3">{props.note}</span>}
        </h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

/** A raised white surface. Content inside is laid out directly, never in further cards. */
export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-surface shadow-raised", className)}>{children}</div>;
}

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Surface className="overflow-x-auto">
      <table aria-label={label} className="w-full min-w-[32rem] text-left">
        {children}
      </table>
    </Surface>
  );
}

export function Th({ children, align }: { children?: ReactNode; align?: "right" }) {
  return (
    <th scope="col" className={cx("px-4 py-2.5 text-xs font-medium text-ink-3", align === "right" && "text-right")}>
      {children}
    </th>
  );
}

export function Td({ children, align, strong, className }: { children?: ReactNode; align?: "right"; strong?: boolean; className?: string }) {
  return <td className={cx("px-4 py-3 text-ink-2", strong && "font-medium text-ink", align === "right" && "text-right", className)}>{children}</td>;
}

/** A table row whose first cell is the link; the whole row highlights on hover. */
export function Row({ children }: { children: ReactNode }) {
  return <tr className="border-t border-line transition-colors duration-100 hover:bg-canvas/60 [&:first-child]:border-t-0">{children}</tr>;
}

export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink hover:text-accent">
      {children}
    </Link>
  );
}

const TONES = {
  neutral: "bg-canvas text-ink-2",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  accent: "bg-accent-soft text-accent",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Surface className="px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-[50ch] text-ink-3">{children}</p>}
    </Surface>
  );
}

/** Label/value pairs, e.g. on a detail header. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-ink-3">{item.label}</dt>
          <dd className="mt-0.5 truncate font-medium text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────────── formatting ─────────────

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const formatDay = (iso: string | null) => (iso ? day.format(new Date(iso)) : "—");
export const formatDate = (iso: string | null) => (iso ? dayYear.format(new Date(iso)) : "—");
export const formatBand = (band: number | null | undefined) => (band == null ? "—" : band.toFixed(1));
export const formatPercent = (ratio: number | null) => (ratio == null ? "—" : `${Math.round(ratio * 100)}%`);

export const SKILL_LABEL = { LISTENING: "Listening", READING: "Reading", WRITING: "Writing", SPEAKING: "Speaking" } as const;

export function waiting(hours: number): string {
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** `WRITING_TASK_2` becomes "Task 2"; `MULTIPLE_CHOICE` becomes "Multiple choice". */
export function humanise(kind: string): string {
  const words = kind.replace(/^(LISTENING|READING|WRITING|SPEAKING)_/, "").toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Rows divided by hairlines inside one surface. */
export function List({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Surface>
      <ul aria-label={label} className="divide-y divide-line">
        {children}
      </ul>
    </Surface>
  );
}

export function Item(props: { title: ReactNode; meta?: ReactNode; trailing?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{props.title}</p>
        {props.meta && <p className="mt-0.5 text-sm text-ink-3">{props.meta}</p>}
      </div>
      {props.trailing}
    </li>
  );
}

export const formatMinutes = (sec: number | null) => (sec == null ? null : `${Math.round(sec / 60)} min`);
