"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AssignmentsIcon, GroupsIcon, OverviewIcon, ReviewsIcon, SignOutIcon, StudentsIcon } from "./icons";

const ITEMS = [
  { href: "/", label: "Overview", icon: <OverviewIcon /> },
  { href: "/groups", label: "Groups", icon: <GroupsIcon /> },
  { href: "/students", label: "Students", icon: <StudentsIcon /> },
  { href: "/assignments", label: "Assignments", icon: <AssignmentsIcon /> },
  { href: "/reviews", label: "Reviews", icon: <ReviewsIcon /> },
] satisfies { href: string; label: string; icon: ReactNode }[];

export function Sidebar(props: { name: string; roles: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex flex-col gap-1 border-b border-line bg-surface px-3 py-3 md:sticky md:top-0 md:h-screen md:border-r md:border-b-0 md:py-5">
      <div className="flex items-center justify-between px-2 pb-1 md:pb-5">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Staff Console</span>
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          className="rounded-lg p-1.5 text-ink-2 transition-colors duration-100 hover:bg-canvas md:hidden"
        >
          <SignOutIcon />
        </button>
      </div>

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto [scrollbar-width:none] md:flex-col md:overflow-visible [&::-webkit-scrollbar]:hidden">
        {ITEMS.map((item) => {
          const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium whitespace-nowrap transition-colors duration-100 ${
                current ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-canvas"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden flex-col gap-1 border-t border-line pt-3 md:flex">
        <div className="min-w-0 px-2.5 pb-1">
          <p className="truncate font-medium text-ink">{props.name}</p>
          <p className="truncate text-xs text-ink-3">{props.roles}</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-ink-2 transition-colors duration-100 hover:bg-canvas"
        >
          <SignOutIcon />
          Sign out
        </button>
      </div>
    </aside>
  );
}
