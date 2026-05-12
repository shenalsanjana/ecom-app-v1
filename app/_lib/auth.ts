// app/_lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/_lib/prisma";
import { LoginSchema } from "@/app/_lib/validation";
import { authConfig } from "@/app/_lib/auth.config";

const authSecret = process.env.AUTH_SECRET;
if (!authSecret && process.env.NODE_ENV === "production") {
  console.warn("AUTH_SECRET is not set in production. Login will fail.");
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: authSecret,
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const parsed = LoginSchema.safeParse(creds);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
