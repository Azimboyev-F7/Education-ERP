"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export const fieldClass =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink transition-colors duration-100 hover:border-ink-3 focus-visible:border-accent";
export const buttonClass =
  "w-full rounded-lg bg-accent px-3 py-2.5 font-medium text-white transition-colors duration-100 hover:bg-accent-hover disabled:opacity-60";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      if (response.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      setError(
        response.status === 429
          ? "Too many attempts. Try again in a few minutes."
          : response.status === 401 || response.status === 400
            ? "That username or password is wrong. Check them and try again."
            : "Could not sign in. Try again.",
      );
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block font-medium text-ink">
        Username
        <input name="username" autoComplete="username" spellCheck={false} autoCapitalize="none" required className={fieldClass} />
      </label>
      <label className="block font-medium text-ink">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={fieldClass} />
      </label>
      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-bad">
            {error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
