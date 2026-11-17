import type { AttemptView } from "@erp/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { apiGet, NotFoundError } from "@/lib/api";
import { Results } from "./results";
import { Runner } from "./runner";

export const metadata: Metadata = { title: "Task" };
export const instant = false;

export default function AttemptPage({ params }: PageProps<"/attempts/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-ink-3">Loading…</p>}>
      <Attempt params={params} />
    </Suspense>
  );
}

async function Attempt({ params }: { params: PageProps<"/attempts/[id]">["params"] }) {
  const { id } = await params;
  const user = await apiGet<{ isStudent: boolean; mustChangePassword: boolean }>("/auth/me");
  if (user.mustChangePassword) redirect("/password");

  let attempt: AttemptView;
  try {
    attempt = await apiGet<AttemptView>(`/attempts/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return attempt.status === "IN_PROGRESS" ? <Runner attempt={attempt} /> : <Results attempt={attempt} />;
}
