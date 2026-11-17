import type { Role } from "@erp/contracts";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { getCurrentUser } from "@/lib/api";

const ROLE_LABEL: Record<Role, string> = {
  ADMINISTRATOR: "Administrator",
  ACADEMIC_MANAGER: "Academic manager",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

/**
 * Every page here reads the signed-in user's session, which can't be prerendered into a static shell,
 * so navigation streams from the server (behind loading.tsx) instead of being instant.
 */
export const instant = false;

export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-10 rounded-lg bg-surface px-3 py-2 font-medium text-accent shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {/* The shell reads the session, so it streams in behind this boundary. */}
      <Suspense fallback={<p className="p-8 text-ink-3">Loading…</p>}>
        <Shell>{children}</Shell>
      </Suspense>
    </>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user.mustChangePassword) redirect("/password");

  if (user.roles.length === 0) {
    return (
      <main className="mx-auto max-w-md p-8 pt-24 text-center">
        <h1 className="text-[22px] font-semibold text-ink">This account has no staff role</h1>
        <p className="mt-2 text-ink-3">Students sign in to the student app instead. Ask an administrator if you need staff access.</p>
      </main>
    );
  }

  const roles = [...new Set(user.roles.map((r) => ROLE_LABEL[r.role]))].join(", ");
  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <Sidebar name={user.fullName} roles={roles} />
      <main id="main" className="min-w-0 px-4 py-8 md:px-8 md:py-10">
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </main>
    </div>
  );
}
