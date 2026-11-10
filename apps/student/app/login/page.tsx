import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-zinc-900">Student App</h1>
        <p className="mt-1 mb-6 text-sm text-zinc-500">Sign in with the username your centre gave you.</p>
        <LoginForm />
      </div>
    </main>
  );
}
