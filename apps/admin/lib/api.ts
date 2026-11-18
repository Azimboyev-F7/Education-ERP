import type { ApiError, Me } from "@erp/contracts";
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
  if (response.status === 403) {
    const error = (await response.json().catch(() => null)) as ApiError | null;
    if (error?.code === "PASSWORD_CHANGE_REQUIRED") redirect("/password");
  }
  if (response.status === 404) throw new NotFoundError(path);
  if (!response.ok) throw new Error(`API ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

/** The API answers 404 for missing rows and for rows outside the caller's scope alike. */
export class NotFoundError extends Error {
  constructor(path: string) {
    super(`Not found: ${path}`);
  }
}

export function getCurrentUser(): Promise<Me> {
  return apiGet<Me>("/auth/me");
}
