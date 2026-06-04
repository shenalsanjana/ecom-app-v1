// app/_lib/auth.config.ts
import type { NextAuthConfig } from "next-auth";

type AppRole = "ADMIN" | "CUSTOMER";

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user && "id" in user) {
        token.uid = user.id as string;
        const role = (user as { role?: AppRole }).role;
        token.role = role === "ADMIN" ? "ADMIN" : "CUSTOMER";
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid;
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

if (process.env.NODE_ENV !== "production") {
  console.log("[Auth Config]: Shared config loaded. Secret set:", !!process.env.AUTH_SECRET);
  if (process.env.AUTH_SECRET?.startsWith('"')) {
    console.warn("[Auth Config]: WARNING: AUTH_SECRET starts with a quote. Check environment variables.");
  }
}
