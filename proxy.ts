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

  // Admin routes: both /admin/* pages and /api/admin/* API endpoints require role === "ADMIN".
  // Page routes redirect to /login or /; API routes return JSON-shaped responses so the
  // client can react without parsing HTML.
  const isAdminApiRoute = path.startsWith("/api/admin");
  const isAdminRoute = isAdminApiRoute || path.startsWith("/admin");
  if (isAdminRoute) {
    if (!isAuthed) {
      if (isAdminApiRoute) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${encodeURIComponent(path)}`, req.url),
      );
    }
    if (!isAdmin) {
      if (isAdminApiRoute) {
        return new NextResponse("Forbidden", { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }
    return;
  }

  // /account, /wishlist — any authenticated user. Preserves the
  // pre-existing behaviour previously enforced by auth.config.authorized.
  if (path.startsWith("/account") || path.startsWith("/wishlist")) {
    if (!isAuthed) {
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${encodeURIComponent(path)}`, req.url),
      );
    }
  }
});

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/wishlist/:path*",
  ],
};
