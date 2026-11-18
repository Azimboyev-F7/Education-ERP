import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-[360px]">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-ink">Staff Console</h1>
        <p className="mt-1 mb-8 text-ink-3">Sign in with the account your centre gave you.</p>
        <LoginForm />
      </div>
    </main>
  );
}
