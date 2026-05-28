// app/_lib/admin-auth.ts
// Server-side admin guards. Use in any /admin server component, server
// action, or API route. The edge proxy (proxy.ts; Next.js 16 renamed
// middleware.ts → proxy.ts) also blocks /admin at the edge — these
// helpers are the defense-in-depth layer that catches any route the
// proxy matcher might miss.
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/app/_lib/auth";

/**
 * Server-component / server-action guard. Redirects unauthenticated users
 * to /login and non-admin authenticated users to /. Returns the session
 * when the caller is an admin.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=/admin`);
  }
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }
  return session;
}

/**
 * API-route guard. Returns the admin session on success, or a 401/403
 * Response the caller should return directly.
 *
 *   const guard = await requireAdminApi();
 *   if (guard instanceof Response) return guard;
 *   const { session } = guard;
 */
export async function requireAdminApi(): Promise<{ session: Session } | Response> {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (session.user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  return { session };
}
