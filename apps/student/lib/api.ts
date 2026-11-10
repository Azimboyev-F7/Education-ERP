import type { Me } from "@erp/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "erp_session";

/**
 * Server-side call to the API on behalf of the signed-in user.
 * Authorization is enforced by the API; this only forwards the session cookie.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) redirect("/login");

  const response = await fetch(`${API_URL}${path}`, {
    headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}` },
  });
  if (response.status === 401) redirect("/login");
  if (!response.ok) throw new Error(`API ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

export function getCurrentUser(): Promise<Me> {
  return apiGet<Me>("/auth/me");
}
