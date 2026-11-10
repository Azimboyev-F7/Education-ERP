import { Suspense } from "react";
import { getCurrentUser } from "@/lib/api";
import { LogoutButton } from "./logout-button";

export default function HomePage() {
  return (
    <div className="flex-1">
      {/* Reads the session, so it streams in behind this boundary. */}
      <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Loading…</p>}>
        <Home />
      </Suspense>
    </div>
  );
}

async function Home() {
  const user = await getCurrentUser();

  return (
    <>
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <span className="text-sm font-semibold text-zinc-900">{user.fullName}</span>
        <LogoutButton />
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {user.isStudent ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5">
            <h1 className="text-base font-semibold text-zinc-900">Nothing to do yet</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Homework from your teacher and your practice plan will appear here.
            </p>
          </section>
        ) : (
          <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
            This is a staff account. Use the Staff Console to manage groups and students.
          </p>
        )}
      </main>
    </>
  );
}
