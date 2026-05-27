// proxy.ts  (Next.js 16 renamed middleware.ts → proxy.ts)
// Edge-level route protection. Must import only from auth.config.ts —
// auth.ts pulls in bcryptjs, which is not Edge-safe. The server-side
// requireAdmin() / requireAdminApi() helpers in app/_lib/admin-auth.ts
// provide the second layer of defense.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/app/_lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isAuthed = !!req.auth;
  const isAdmin = req.auth?.user?.role === "ADMIN";

  if (path.startsWith("/admin")) {
    if (!isAuthed) {
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${path}`, req.url),
      );
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return;
  }

  // /account, /wishlist — any authenticated user. Preserves the
  // pre-existing behaviour previously enforced by auth.config.authorized.
  if (path.startsWith("/account") || path.startsWith("/wishlist")) {
    if (!isAuthed) {
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${path}`, req.url),
      );
    }
  }
});

export const config = {
  matcher: ["/account/:path*", "/admin/:path*", "/wishlist/:path*"],
};
