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
      const { pathname } = request.nextUrl;
      const isProtected = ["/account", "/wishlist"].some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
      );

      console.log(`[Auth Config]: Authorized check for ${pathname}, protected: ${isProtected}, hasAuth: ${!!auth}`);

      if (!isProtected) return true;
      if (auth) return true;

      // Returning false will redirect to the signIn page defined in 'pages'.
      return false;
    },
    jwt({ token, user }) {
      if (user && "id" in user) {
        console.log(`[Auth Config]: JWT callback - user id ${user.id}`);
        token.uid = user.id as string;
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

console.log("[Auth Config]: Shared config loaded. Secret set:", !!process.env.AUTH_SECRET);
if (process.env.AUTH_SECRET?.startsWith('"')) {
  console.warn("[Auth Config]: WARNING: AUTH_SECRET starts with a quote. Check environment variables.");
}
