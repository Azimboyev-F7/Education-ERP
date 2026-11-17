"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Starts (or resumes) an attempt, then opens it. */
export function StartButton(props: { body: { recipientId: string } | { versionId: string; timed?: boolean }; label: string; subtle?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(props.body),
      });
      if (response.ok) {
        const { id } = (await response.json()) as { id: string };
        router.push(`/attempts/${id}`);
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(response.status === 409 || response.status === 400 ? (body?.message ?? "You can’t start this right now.") : "Could not start. Try again.");
    } catch {
      setError("Could not reach the server. Check your connection.");
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className={`rounded-lg px-4 py-2 font-medium whitespace-nowrap transition-colors duration-100 disabled:opacity-60 ${
          props.subtle ? "bg-canvas text-ink hover:bg-line" : "bg-accent text-white hover:bg-accent-hover"
        }`}
      >
        {pending ? "Opening…" : props.label}
      </button>
      <div aria-live="polite">
        {error && (
          <p role="alert" className="max-w-[16rem] text-right text-xs text-bad">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
