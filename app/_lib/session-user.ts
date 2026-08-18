// app/_lib/session-user.ts
//
// Sessions are JWTs (app/_lib/auth.config.ts: strategy "jwt", 30-day maxAge).
// `token.uid` is written once at login and is NEVER revalidated against the
// database, so a perfectly valid, correctly-signed cookie can name a `User` row
// that no longer exists — or that never existed in THIS database (a restored or
// replaced database, a removed account).
//
// That makes `session.user.id` untrusted input wherever it is used as a FOREIGN
// KEY. Writing it unverified raises a foreign-key violation at the database:
// `Order_userId_fkey` took down the whole checkout, and `WishlistItem_userId_fkey`
// is the same hazard on the wishlist.
//
// Use this helper for any WRITE that stores `userId` as a foreign key. Reads
// (`where: { userId }`) are safe without it — a stale id simply matches nothing.
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";

export type VerifiedSessionUser = {
  id: string;
  name: string | null;
  email: string | null;
};

/**
 * Resolves the signed-in user ONLY if their row still exists.
 *
 * Returns null when there is no session, or when the session names a user that
 * is no longer in the database. Callers decide what that means for them —
 * checkout falls back to a guest order so the sale is not lost; the wishlist
 * sends the visitor back to sign in.
 *
 * `name`/`email` come from the session claims (the display values the user
 * signed in with); only `id` is database-verified, because only `id` is used as
 * a foreign key. Resolving both here keeps callers to a single `auth()` call.
 */
export async function getVerifiedSessionUser(): Promise<VerifiedSessionUser | null> {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return null;

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true },
  });

  if (!user) {
    // Worth knowing about: a run of these means many customers are carrying
    // cookies for rows that are gone, which points at a database-level event
    // rather than ordinary account churn.
    console.warn("[auth] session names a user that no longer exists", { sessionUserId });
    return null;
  }

  return {
    id: user.id,
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
  };
}
