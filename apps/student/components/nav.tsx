"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { PracticeIcon, ProgressIcon, SignOutIcon, TodayIcon } from "./icons";

const ITEMS = [
  { href: "/", label: "Today", icon: <TodayIcon /> },
  { href: "/practice", label: "Practice", icon: <PracticeIcon /> },
  { href: "/progress", label: "Progress", icon: <ProgressIcon /> },
] satisfies { href: string; label: string; icon: ReactNode }[];

/** A top bar on wide screens, a bottom tab bar on phones where thumbs reach. */
export function Nav(props: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const items = ITEMS.map((item) => {
    const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return { ...item, current };
  });

  return (
    <>
      <header className="sticky top-0 z-10 hidden border-b border-line bg-surface md:block">
        <div className="mx-auto flex h-14 max-w-[960px] items-center gap-8 px-8">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Student App</span>
          <nav aria-label="Main" className="flex flex-1 gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-colors duration-100 ${
                  item.current ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-canvas"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="max-w-[12rem] truncate text-ink-3">{props.name}</span>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium text-ink-2 transition-colors duration-100 hover:bg-canvas"
          >
            <SignOutIcon />
            Sign Out
          </button>
        </div>
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.current ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors duration-100 ${
              item.current ? "text-accent" : "text-ink-3"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
        <button type="button" onClick={signOut} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium text-ink-3">
          <SignOutIcon />
          Sign Out
        </button>
      </nav>
    </>
  );
}
