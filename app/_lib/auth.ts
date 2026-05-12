// app/_lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/_lib/prisma";
import { LoginSchema } from "@/app/_lib/validation";
import { authConfig } from "@/app/_lib/auth.config";

const authSecret = process.env.AUTH_SECRET;
if (!authSecret && process.env.NODE_ENV === "production") {
  console.warn("[Auth]: AUTH_SECRET is not set in production. Login will fail.");
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: authSecret,
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
  logger: {
    error: (code, metadata) => {
      console.error(`[NextAuth Error]: ${code}`, metadata);
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
            console.warn("[Auth]: Validation failed in authorize");
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

          const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
          if (!ok) {
            console.warn(`[Auth]: Invalid password for ${parsed.data.email}`);
            return null;
          }

          console.log(`[Auth]: Login success for ${parsed.data.email}`);
          return { id: user.id, name: user.name, email: user.email };
        } catch (error) {
          console.error("[Auth]: Unexpected error in authorize:", error);
          return null;
        }
      },
    }),
  ],
});
