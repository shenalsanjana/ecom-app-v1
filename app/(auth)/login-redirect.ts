// app/(auth)/login-redirect.ts
// Pure decision function: given the just-authenticated user's role and the
// callbackUrl from the login form, return where to send them next. Kept
// outside actions.ts so it stays free of the "use server" directive and is
// trivially unit-testable.

type Role = "ADMIN" | "CUSTOMER";

export function chooseLoginRedirect(role: Role, callbackUrl: string): string {
  const normalized = callbackUrl || "/";
  if (role === "ADMIN" && normalized === "/") {
    return "/admin";
  }
  return normalized;
}
