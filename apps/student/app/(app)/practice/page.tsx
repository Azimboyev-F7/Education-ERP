import type { PracticeItem } from "@erp/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, formatMinutes, Item, List, PageHeader, SKILL_LABEL } from "@/components/ui";
import { StartButton } from "@/components/start-button";
import { apiGet } from "@/lib/api";

export const metadata: Metadata = { title: "Practice" };
export const instant = false;

const FILTERS = [{ key: "all", label: "All" }, ...Object.entries(SKILL_LABEL).map(([key, label]) => ({ key, label }))];

export default async function PracticePage({ searchParams }: PageProps<"/practice">) {
  const { skill } = await searchParams;
  const active = FILTERS.find((f) => f.key === skill)?.key ?? "all";
  const items = (await apiGet<PracticeItem[]>("/practice/task-sets")).filter((i) => active === "all" || i.skill === active);

  return (
    <>
      <PageHeader title="Practice" description="Choose something to work on. Nothing here is marked by your teacher, and you can stop and come back." />

      <nav aria-label="Skill" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/practice" : `/practice?skill=${f.key}`}
            aria-current={f.key === active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-100 ${
              f.key === active ? "bg-ink text-white" : "bg-surface text-ink-2 hover:bg-line"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <Empty title="Nothing to practise here yet">Your centre hasn’t published practice for this skill. Check another skill, or come back later.</Empty>
      ) : (
        <List label="Practice sets">
          {items.map((i) => (
            <Item
              key={i.versionId}
              title={i.title}
              meta={
                <>
                  {i.skill ? SKILL_LABEL[i.skill] : "Mixed"}
                  {formatMinutes(i.timeLimitSec) && ` · ${formatMinutes(i.timeLimitSec)}`}
                  {i.difficulty != null && ` · Level ${i.difficulty}`}
                  {i.fullLength && <span className="ml-2 align-middle"><Badge tone="accent">Full test</Badge></span>}
                </>
              }
              trailing={<StartButton body={{ versionId: i.versionId, timed: i.fullLength }} label="Start" subtle />}
            />
          ))}
        </List>
      )}
    </>
  );
}
