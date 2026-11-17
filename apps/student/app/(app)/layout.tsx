import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { getCurrentUser } from "@/lib/api";

/** Every page reads the signed-in student's session, so navigation streams from the server behind loading.tsx. */
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-20 rounded-lg bg-surface px-3 py-2 font-medium text-accent shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Suspense fallback={<p className="p-8 text-ink-3">Loading…</p>}>
        <Shell>{children}</Shell>
      </Suspense>
    </>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user.mustChangePassword) redirect("/password");

  if (!user.isStudent) {
    return (
      <main className="mx-auto max-w-md p-8 pt-24 text-center">
        <h1 className="text-[22px] font-semibold text-ink">This is a staff account</h1>
        <p className="mt-2 text-ink-3">Staff sign in to the Staff Console to manage groups and students.</p>
      </main>
    );
  }

  return (
    <>
      <Nav name={user.fullName} />
      <main id="main" className="mx-auto w-full max-w-[960px] px-4 pt-8 pb-28 md:px-8 md:pt-10 md:pb-16">
        {children}
      </main>
    </>
  );
}
