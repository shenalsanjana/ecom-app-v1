// app/_lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/_lib/prisma";
import { LoginSchema } from "@/app/_lib/validation";
import { authConfig } from "@/app/_lib/auth.config";

console.log("[Auth]: auth.ts module loading...");
const authSecret = process.env.AUTH_SECRET;

if (!authSecret) {
  console.warn("[Auth]: CRITICAL: AUTH_SECRET is not set in environment!");
} else {
  console.log(`[Auth]: AUTH_SECRET is set (length: ${authSecret.length})`);
  if (authSecret.startsWith('"')) {
    console.warn("[Auth]: WARNING: AUTH_SECRET starts with a quote!");
  }
}

console.log(`[Auth]: bcrypt available: ${typeof bcrypt.compare === "function"}`);

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: authSecret,
  trustHost: true,
  debug: true, // Force debug mode on to see full NextAuth logs in production console
  logger: {
    error: (error) => {
      console.error(`[NextAuth Error]:`, error);
    },
    warn: (code) => {
      console.warn(`[NextAuth Warn]: ${code}`);
    },
    debug: (code, metadata) => {
      console.log(`[NextAuth Debug]: ${code}`, metadata);
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        try {
          const parsed = LoginSchema.safeParse(creds);
          if (!parsed.success) {
            console.warn("[Auth]: Validation failed in authorize", parsed.error.format());
            return null;
          }

          console.log(`[Auth]: Attempting login for ${parsed.data.email}`);
          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
          });

          if (!user) {
            console.warn(`[Auth]: User not found: ${parsed.data.email}`);
            return null;
          }

          console.log(`[Auth]: User found, comparing passwords...`);
          const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
          
          if (!ok) {
            console.warn(`[Auth]: Invalid password for ${parsed.data.email}`);
            return null;
          }

          console.log(`[Auth]: Login success for ${parsed.data.email} (${user.id})`);
          return { id: user.id, name: user.name, email: user.email };
        } catch (error) {
          console.error("[Auth]: Unexpected error in authorize:", error);
          // Return null instead of throwing to avoid generic "Server Configuration" error if possible
          return null;
        }
      },
    }),
  ],
});

console.log("[Auth]: handlers and auth initialized.");
