import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/api";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function PasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-[360px]">
        <Suspense fallback={<p className="text-ink-3">Loading…</p>}>
          <Content />
        </Suspense>
      </div>
    </main>
  );
}

async function Content() {
  const user = await getCurrentUser();
  return (
    <>
      <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-ink">
        {user.mustChangePassword ? "Choose a new password" : "Change password"}
      </h1>
      <p className="mt-1 mb-8 text-ink-3">
        {user.mustChangePassword
          ? "You signed in with a temporary password. Choose your own to continue."
          : "Changing it signs you out of other devices."}
      </p>
      <PasswordForm />
    </>
  );
}
