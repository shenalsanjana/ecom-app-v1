// app/_lib/auth.config.ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const protectedPaths = ["/account", "/wishlist"];
      const path = request.nextUrl.pathname;
      const isProtected = protectedPaths.some(
        (p) => path === p || path.startsWith(p + "/"),
      );
      if (!isProtected) return true;
      if (auth) return true;
      const url = new URL("/login", request.url);
      url.searchParams.set("callbackUrl", path);
      return Response.redirect(url);
    },
    jwt({ token, user }) {
      if (user && "id" in user && typeof user.id === "string") {
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
