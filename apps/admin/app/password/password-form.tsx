"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonClass, fieldClass } from "../login/login-form";

export function PasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = String(form.get("newPassword"));
    if (next !== String(form.get("confirm"))) {
      setError("The two new passwords don’t match. Type them again.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: next }),
      });
      if (response.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string; issues?: { message: string }[] } | null;
      setError(
        response.status === 429
          ? "Too many attempts. Try again in a few minutes."
          : response.status === 400
            ? (body?.issues?.[0]?.message ?? body?.message ?? "Check the passwords and try again.")
            : "Could not change the password. Try again.",
      );
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block font-medium text-ink">
        Current password
        <input name="currentPassword" type="password" autoComplete="current-password" required className={fieldClass} />
      </label>
      <label className="block font-medium text-ink">
        New password
        <input name="newPassword" type="password" autoComplete="new-password" minLength={10} required className={fieldClass} />
        <span className="mt-1 block text-xs font-normal text-ink-3">At least 10 characters.</span>
      </label>
      <label className="block font-medium text-ink">
        Confirm new password
        <input name="confirm" type="password" autoComplete="new-password" required className={fieldClass} />
      </label>
      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-bad">
            {error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Save Password"}
      </button>
    </form>
  );
}
